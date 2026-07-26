import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import "./admin";
import { executeAgentAction } from "./executeAgentAction";
import { ExecuteAgentActionInput } from "./types";

setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const geminiKey = defineSecret("GEMINI_API_KEY");
const googleClientId = defineSecret("GOOGLE_OAUTH_CLIENT_ID");
const googleClientSecret = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET");
const zohoClientId = defineSecret("ZOHO_CLIENT_ID");
const zohoClientSecret = defineSecret("ZOHO_CLIENT_SECRET");
const whatsappVerifyToken = defineSecret("WHATSAPP_VERIFY_TOKEN");
const msClientId = defineSecret("MS_CLIENT_ID");
const msClientSecret = defineSecret("MS_CLIENT_SECRET");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

/**
 * TEMPORARY — verifies the Gemini key + wrapper work end-to-end.
 * Remove once agents are live.
 */
export const pingGemini = onRequest({ secrets: [geminiKey] }, async (_req, res) => {
  const { callGemini } = await import("./gemini");
  try {
    const r = await callGemini({ prompt: "Reply with exactly: Ellipse backend is live." });
    res.json({ ok: true, text: r.text, tokens: r.usageTokens });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

/**
 * TEMPORARY — verifies the Zoho token refresh + api_domain chain end-to-end.
 * Call with ?enterpriseId=... Remove once the Zoho agent is live.
 */
export const pingZoho = onRequest(
  { secrets: [zohoClientId, zohoClientSecret] },
  async (req, res) => {
    const enterpriseId = req.query.enterpriseId as string | undefined;
    if (!enterpriseId) {
      res.status(400).json({ ok: false, error: "Missing enterpriseId" });
      return;
    }
    try {
      const { listModules } = await import("./connections/zoho");
      const data = await listModules(enterpriseId);
      const names = (data?.modules ?? []).map((m: any) => m.api_name).slice(0, 10);
      res.json({ ok: true, moduleCount: data?.modules?.length ?? 0, sample: names });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  }
);

/**
 * Callable wrapper around the execution gate — used for testing the mode/tier/
 * wallet logic from the client before the real agent runners exist.
 * Agent runners will call executeAgentAction() directly (server-side).
 */
export const runAgentAction = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }

  const data = request.data as Partial<ExecuteAgentActionInput>;
  if (!data.enterpriseId || !data.actionType || !data.domain || !data.targetSystem) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }

  const result = await executeAgentAction({
    enterpriseId: data.enterpriseId,
    agentId: data.agentId ?? "manual-test",
    domain: data.domain,
    actionType: data.actionType,
    params: data.params ?? {},
    targetSystem: data.targetSystem,
    reasoning: data.reasoning ?? "Manual test action",
  });

  return result;
});

/**
 * Step 1 of Gmail connect — returns the Google consent URL.
 * Called from the Integrations page; frontend redirects the user to the URL.
 */
export const startGoogleConnect = onCall(
  { secrets: [googleClientId, googleClientSecret] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
    const enterpriseId = request.data?.enterpriseId as string | undefined;
    if (!enterpriseId) throw new HttpsError("invalid-argument", "Missing enterpriseId.");

    const { buildConsentUrl } = await import("./connections/google");
    return { url: buildConsentUrl(enterpriseId) };
  }
);

/**
 * Step 2 — Google redirects here with ?code & ?state(enterpriseId).
 * Exchanges the code, stores the connection, then bounces back to the app.
 */
export const gmailOAuthCallback = onRequest(
  { secrets: [googleClientId, googleClientSecret] },
  async (req, res) => {
    const code = req.query.code as string | undefined;
    const enterpriseId = req.query.state as string | undefined;

    if (!code || !enterpriseId) {
      res.redirect(`${FRONTEND_URL}/integrations?google=error`);
      return;
    }

    try {
      const { handleCallback } = await import("./connections/google");
      await handleCallback(code, enterpriseId);
      res.redirect(`${FRONTEND_URL}/integrations?google=connected`);
    } catch (e) {
      logger.error("Gmail OAuth callback failed", e);
      res.redirect(`${FRONTEND_URL}/integrations?google=error`);
    }
  }
);

/**
 * Manually pull recent Gmail into the unified inbox (conversations + messages).
 */
export const syncGmail = onCall(
  { secrets: [googleClientId, googleClientSecret] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
    const enterpriseId = request.data?.enterpriseId as string | undefined;
    if (!enterpriseId) throw new HttpsError("invalid-argument", "Missing enterpriseId.");

    const { ingestRecentGmail } = await import("./connections/google");
    const count = await ingestRecentGmail(enterpriseId);
    return { ingested: count };
  }
);

/**
 * Auto-sync — pulls new Gmail for every connected account every 5 minutes so
 * users don't have to press the Sync button. The inbox updates live via
 * onSnapshot, so new messages just appear.
 */
export const scheduledGmailSync = onSchedule(
  { schedule: "every 5 minutes", secrets: [googleClientId, googleClientSecret] },
  async () => {
    const { syncAllConnectedGmail } = await import("./connections/google");
    const ingested = await syncAllConnectedGmail();
    logger.info("scheduledGmailSync complete", { ingested });
  }
);

/** Auto-sync all connected SMTP/IMAP mailboxes every 5 minutes. */
export const scheduledImapSync = onSchedule({ schedule: "every 5 minutes" }, async () => {
  const { syncAllConnectedImap } = await import("./connections/smtp");
  const ingested = await syncAllConnectedImap();
  logger.info("scheduledImapSync complete", { ingested });
});

/** Manually pull recent Outlook mail into the unified inbox. */
export const syncOutlook = onCall({ secrets: [msClientId, msClientSecret] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const enterpriseId = request.data?.enterpriseId as string | undefined;
  if (!enterpriseId) throw new HttpsError("invalid-argument", "Missing enterpriseId.");
  const { ingestRecentOutlook } = await import("./connections/microsoft365");
  return { ingested: await ingestRecentOutlook(enterpriseId) };
});

/** Auto-sync all connected Outlook accounts every 5 minutes. */
export const scheduledOutlookSync = onSchedule(
  { schedule: "every 5 minutes", secrets: [msClientId, msClientSecret] },
  async () => {
    const { syncAllConnectedOutlook } = await import("./connections/microsoft365");
    const ingested = await syncAllConnectedOutlook();
    logger.info("scheduledOutlookSync complete", { ingested });
  }
);

/**
 * Connect an SMTP/IMAP mailbox — verifies the credentials, then stores them.
 */
export const connectSmtp = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const d = request.data ?? {};
  const enterpriseId = d.enterpriseId as string | undefined;
  if (!enterpriseId || !d.imap_host || !d.smtp_host || !d.username || !d.password) {
    throw new HttpsError("invalid-argument", "Missing connection fields.");
  }
  const cfg = {
    imap_host: d.imap_host,
    imap_port: Number(d.imap_port) || 993,
    smtp_host: d.smtp_host,
    smtp_port: Number(d.smtp_port) || 465,
    username: d.username,
    password: d.password,
    from_email: d.from_email || d.username,
  };

  const { testSmtpConnection, saveSmtpConnection, ingestRecentImap } = await import("./connections/smtp");
  try {
    await testSmtpConnection(cfg);
  } catch (e) {
    throw new HttpsError("failed-precondition", `Connection failed: ${(e as Error).message}`);
  }
  await saveSmtpConnection(enterpriseId, cfg);
  try {
    await ingestRecentImap(enterpriseId);
  } catch {
    // non-fatal
  }
  return { ok: true };
});

/**
 * WhatsApp webhook.
 *  - GET: Meta's verification handshake (echoes hub.challenge if the token matches).
 *  - POST: inbound messages → normalized into the unified inbox.
 */
export const whatsappWebhook = onRequest({ secrets: [whatsappVerifyToken] }, async (req, res) => {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
    return;
  }

  // POST — acknowledge fast, then process.
  logger.info("WhatsApp webhook POST received", {
    body: JSON.stringify(req.body ?? {}).slice(0, 3000),
  });
  try {
    const { handleInboundWebhook } = await import("./connections/whatsapp");
    const n = await handleInboundWebhook(req.body);
    logger.info("WhatsApp webhook processed", { ingested: n });
  } catch (e) {
    logger.error("WhatsApp webhook processing failed", e);
  }
  res.sendStatus(200);
});

/** Connect WhatsApp — verifies the token/phone, then stores the config. */
export const connectWhatsapp = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const d = request.data ?? {};
  const enterpriseId = d.enterpriseId as string | undefined;
  if (!enterpriseId || !d.phone_number_id || !d.access_token) {
    throw new HttpsError("invalid-argument", "Missing enterpriseId, phone_number_id, or access_token.");
  }
  const cfg = {
    phone_number_id: String(d.phone_number_id),
    access_token: String(d.access_token),
    waba_id: d.waba_id ? String(d.waba_id) : undefined,
    display_phone_number: d.display_phone_number ? String(d.display_phone_number) : undefined,
  };

  const { testWhatsappConnection, saveWhatsappConnection } = await import("./connections/whatsapp");
  try {
    await testWhatsappConnection(cfg);
  } catch (e) {
    throw new HttpsError("failed-precondition", `Connection failed: ${(e as Error).message}`);
  }
  await saveWhatsappConnection(enterpriseId, cfg);
  return { ok: true };
});

/** Generate (or fetch) the website tracking site key for an enterprise. */
export const registerWebsite = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const enterpriseId = request.data?.enterpriseId as string | undefined;
  const domain = request.data?.domain as string | undefined;
  if (!enterpriseId) throw new HttpsError("invalid-argument", "Missing enterpriseId.");
  const { registerWebsite: reg } = await import("./connections/web");
  return reg(enterpriseId, domain);
});

/** Verify the tracking tag is live on the given URL, then activate the connection. */
export const verifyWebsiteInstall = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const enterpriseId = request.data?.enterpriseId as string | undefined;
  const url = request.data?.url as string | undefined;
  if (!enterpriseId || !url) throw new HttpsError("invalid-argument", "Missing enterpriseId or url.");
  const { verifyWebsiteInstall: verify } = await import("./connections/web");
  return verify(enterpriseId, url);
});

/** Serves the tracker JS that customer websites embed. */
export const webTag = onRequest(async (_req, res) => {
  const { trackerScript } = await import("./connections/web");
  res.set("Content-Type", "application/javascript; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(trackerScript());
});

/** Public endpoint the tracker beacons to. CORS-open; keyed by site key. */
export const collectWebEvent = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  try {
    // Body may arrive as text (sendBeacon) or parsed JSON.
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const fwd = ((req.headers["x-forwarded-for"] as string) || "").split(",")[0].trim();
    const ip = fwd || req.ip || "";
    const { recordWebEvent, geoLookup } = await import("./connections/web");
    const geo = await geoLookup(ip);
    await recordWebEvent(body?.site, {
      type: body?.type,
      url: body?.url,
      ref: body?.ref,
      vid: body?.vid,
      sid: body?.sid,
      nv: body?.nv,
      country: geo.country,
      city: geo.city,
    });
  } catch (e) {
    logger.error("collectWebEvent failed", e);
  }
  res.status(200).send("ok");
});

/** Step 1 of Microsoft 365 connect — returns the consent URL. */
export const startMicrosoftConnect = onCall(
  { secrets: [msClientId, msClientSecret] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
    const enterpriseId = request.data?.enterpriseId as string | undefined;
    if (!enterpriseId) throw new HttpsError("invalid-argument", "Missing enterpriseId.");
    const { buildConsentUrl } = await import("./connections/microsoft365");
    return { url: buildConsentUrl(enterpriseId) };
  }
);

/** Step 2 — Microsoft redirects here with ?code & ?state(enterpriseId). */
export const microsoftOAuthCallback = onRequest(
  { secrets: [msClientId, msClientSecret] },
  async (req, res) => {
    const code = req.query.code as string | undefined;
    const enterpriseId = req.query.state as string | undefined;
    if (!code || !enterpriseId) {
      res.redirect(`${FRONTEND_URL}/integrations?ms=error`);
      return;
    }
    try {
      const { handleCallback } = await import("./connections/microsoft365");
      await handleCallback(code, enterpriseId);
      res.redirect(`${FRONTEND_URL}/integrations?ms=connected`);
    } catch (e) {
      logger.error("Microsoft OAuth callback failed", e);
      res.redirect(`${FRONTEND_URL}/integrations?ms=error`);
    }
  }
);

/** TEMPORARY — verify the MS365 connection. ?enterpriseId=... Remove before ship. */
export const pingMicrosoft = onRequest(
  { secrets: [msClientId, msClientSecret] },
  async (req, res) => {
    const enterpriseId = req.query.enterpriseId as string | undefined;
    if (!enterpriseId) {
      res.status(400).json({ ok: false, error: "Missing enterpriseId" });
      return;
    }
    const { verifyConnection } = await import("./connections/microsoft365");
    res.json(await verifyConnection(enterpriseId));
  }
);

/** Manually pull recent mail from a connected SMTP/IMAP mailbox. */
export const syncSmtp = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const enterpriseId = request.data?.enterpriseId as string | undefined;
  if (!enterpriseId) throw new HttpsError("invalid-argument", "Missing enterpriseId.");
  const { ingestRecentImap } = await import("./connections/smtp");
  const count = await ingestRecentImap(enterpriseId);
  return { ingested: count };
});

/**
 * TEMPORARY — triggers the Zoho backfill for an already-connected account.
 * Call with ?enterpriseId=...&days=30. Remove before ship.
 */
export const zohoBackfillDebug = onRequest(
  { secrets: [zohoClientId, zohoClientSecret] },
  async (req, res) => {
    const enterpriseId = req.query.enterpriseId as string | undefined;
    const days = Number(req.query.days ?? 30);
    if (!enterpriseId) {
      res.status(400).json({ ok: false, error: "Missing enterpriseId" });
      return;
    }
    try {
      const { backfillZoho } = await import("./connections/zoho");
      const result = await backfillZoho(enterpriseId, days);
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  }
);

/**
 * TEMPORARY — searches Zoho for a record by email to confirm a write landed.
 * Call with ?enterpriseId=...&email=... Remove before ship.
 */
export const zohoSearchDebug = onRequest(
  { secrets: [zohoClientId, zohoClientSecret] },
  async (req, res) => {
    const enterpriseId = req.query.enterpriseId as string | undefined;
    const email = req.query.email as string | undefined;
    if (!enterpriseId || !email) {
      res.status(400).json({ ok: false, error: "Missing enterpriseId or email" });
      return;
    }
    try {
      const { searchByEmail } = await import("./connections/zoho");
      const lead = await searchByEmail(enterpriseId, "Leads", email);
      const contact = lead ? null : await searchByEmail(enterpriseId, "Contacts", email);
      res.json({ ok: true, lead, contact });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  }
);

/**
 * Run the Gmail agent over a conversation: draft a reply (CRM-aware if the sender
 * is in Zoho) and route it through the gate as a send_reply action.
 */
export const runGmailAgent = onCall(
  { secrets: [geminiKey, googleClientId, googleClientSecret, zohoClientId, zohoClientSecret, msClientId, msClientSecret] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
    const enterpriseId = request.data?.enterpriseId as string | undefined;
    const conversationId = request.data?.conversationId as string | undefined;
    if (!enterpriseId || !conversationId) {
      throw new HttpsError("invalid-argument", "Missing enterpriseId or conversationId.");
    }
    const { runGmailAgent: run } = await import("./agents/gmailAgent");
    return run(enterpriseId, conversationId);
  }
);

/**
 * TEMPORARY debug trigger for the Gmail agent. ?enterpriseId=&conversationId=
 * (defaults to latest conversation). Remove before ship.
 */
export const runGmailAgentDebug = onRequest(
  { secrets: [geminiKey, googleClientId, googleClientSecret, zohoClientId, zohoClientSecret, msClientId, msClientSecret] },
  async (req, res) => {
    const enterpriseId = req.query.enterpriseId as string | undefined;
    let conversationId = req.query.conversationId as string | undefined;
    if (!enterpriseId) {
      res.status(400).json({ ok: false, error: "Missing enterpriseId" });
      return;
    }
    try {
      const { db } = await import("./admin");
      if (!conversationId) {
        const snap = await db
          .collection("conversations")
          .where("enterprise_id", "==", enterpriseId)
          .get();
        const latest = snap.docs
          .map((d) => ({ id: d.id, at: (d.data().last_message_at as any)?.toMillis?.() ?? 0 }))
          .sort((a, b) => b.at - a.at)[0];
        if (!latest) {
          res.status(404).json({ ok: false, error: "No conversations for this enterprise" });
          return;
        }
        conversationId = latest.id;
      }
      // Dispatch to the connection's own agent based on the conversation channel.
      const convSnap = await db.doc(`conversations/${conversationId}`).get();
      const channel = convSnap.data()?.channel as string | undefined;
      let result;
      if (channel === "smtp") {
        result = await (await import("./agents/smtpAgent")).runSmtpAgent(enterpriseId, conversationId);
      } else if (channel === "microsoft365") {
        result = await (await import("./agents/microsoftAgent")).runMicrosoftAgent(enterpriseId, conversationId);
      } else if (channel === "whatsapp") {
        result = await (await import("./agents/whatsappAgent")).runWhatsappAgent(enterpriseId, conversationId);
      } else {
        result = await (await import("./agents/gmailAgent")).runGmailAgent(enterpriseId, conversationId);
      }
      res.json({ ok: true, conversationId, channel, ...result });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  }
);

/**
 * TEMPORARY debug trigger — runs the Zoho agent over a conversation without auth,
 * so we can test the write path via curl. Defaults to the most recent conversation
 * for the enterprise if no conversationId is given. Remove before ship.
 */
export const runZohoAgentDebug = onRequest(
  { secrets: [geminiKey, zohoClientId, zohoClientSecret, googleClientId, googleClientSecret] },
  async (req, res) => {
    const enterpriseId = req.query.enterpriseId as string | undefined;
    let conversationId = req.query.conversationId as string | undefined;
    if (!enterpriseId) {
      res.status(400).json({ ok: false, error: "Missing enterpriseId" });
      return;
    }
    try {
      const { db } = await import("./admin");

      // Optional: pull fresh Gmail first so a just-sent email is picked up.
      if (req.query.sync === "1") {
        const { ingestRecentGmail } = await import("./connections/google");
        await ingestRecentGmail(enterpriseId);
      }

      if (!conversationId) {
        const snap = await db
          .collection("conversations")
          .where("enterprise_id", "==", enterpriseId)
          .get();
        const latest = snap.docs
          .map((d) => ({ id: d.id, at: (d.data().last_message_at as any)?.toMillis?.() ?? 0 }))
          .sort((a, b) => b.at - a.at)[0];
        if (!latest) {
          res.status(404).json({ ok: false, error: "No conversations for this enterprise" });
          return;
        }
        conversationId = latest.id;
      }

      const { runZohoAgent: run } = await import("./agents/zohoAgent");
      const result = await run(enterpriseId, conversationId);
      res.json({ ok: true, conversationId, ...result });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  }
);

/**
 * Run the Zoho CRM agent over a conversation: enrich from Zoho, draft a reply,
 * and route any proposed CRM updates through the gate (mode decides suggest/execute).
 */
export const runZohoAgent = onCall(
  { secrets: [geminiKey, zohoClientId, zohoClientSecret] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
    const enterpriseId = request.data?.enterpriseId as string | undefined;
    const conversationId = request.data?.conversationId as string | undefined;
    if (!enterpriseId || !conversationId) {
      throw new HttpsError("invalid-argument", "Missing enterpriseId or conversationId.");
    }

    const { runZohoAgent: run } = await import("./agents/zohoAgent");
    return run(enterpriseId, conversationId);
  }
);

/**
 * Step 1 of Zoho connect — returns the Zoho consent URL.
 */
export const startZohoConnect = onCall(
  { secrets: [zohoClientId, zohoClientSecret] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
    const enterpriseId = request.data?.enterpriseId as string | undefined;
    if (!enterpriseId) throw new HttpsError("invalid-argument", "Missing enterpriseId.");

    const { buildConsentUrl } = await import("./connections/zoho");
    return { url: buildConsentUrl(enterpriseId) };
  }
);

/**
 * Step 2 — Zoho redirects here with ?code, ?state(enterpriseId) and the
 * DC-specific ?accounts-server. Exchanges the code, stores the connection,
 * then bounces back to the app.
 */
export const zohoOAuthCallback = onRequest(
  { secrets: [zohoClientId, zohoClientSecret] },
  async (req, res) => {
    const code = req.query.code as string | undefined;
    const enterpriseId = req.query.state as string | undefined;
    const accountsServer = req.query["accounts-server"] as string | undefined;

    if (!code || !enterpriseId) {
      res.redirect(`${FRONTEND_URL}/integrations?zoho=error`);
      return;
    }

    try {
      const { handleCallback } = await import("./connections/zoho");
      await handleCallback(code, enterpriseId, accountsServer);
      res.redirect(`${FRONTEND_URL}/integrations?zoho=connected`);
    } catch (e) {
      logger.error("Zoho OAuth callback failed", e);
      res.redirect(`${FRONTEND_URL}/integrations?zoho=error`);
    }
  }
);

/**
 * Hourly report generator — for every enterprise at its local midnight, produce
 * the due agent reports (daily always; weekly on Mon; monthly/quarterly/annual
 * on period start). Idempotent, so hourly re-runs are safe.
 */
export const scheduledReports = onSchedule(
  { schedule: "every 60 minutes", secrets: [geminiKey, zohoClientId, zohoClientSecret, msClientId, msClientSecret] },
  async () => {
    const { generateDueReports } = await import("./reports");
    const res = await generateDueReports();
    logger.info("scheduledReports complete", res);
  }
);

/**
 * On-demand report generation for testing — builds the last completed period
 * for each active agent. data: { enterpriseId, period? }.
 */
export const generateReportsNow = onCall(
  { secrets: [geminiKey, zohoClientId, zohoClientSecret, msClientId, msClientSecret] },
  async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const enterpriseId = request.data?.enterpriseId as string | undefined;
  const period = (request.data?.period as string | undefined) ?? "daily";
  if (!enterpriseId) throw new HttpsError("invalid-argument", "Missing enterpriseId.");
  const { generateReportsNow: gen } = await import("./reports");
  return gen(enterpriseId, period as any);
});

/**
 * Conversational chat with an agent (or Ivy). Ivy can read across all agents and
 * delegate actions; a specific agentId scopes to that connection. Any action the
 * chat takes routes through the gate, so approval rules are respected.
 * data: { enterpriseId, agentId, message, history? }
 */
export const askAgent = onCall(
  {
    secrets: [
      geminiKey,
      googleClientId,
      googleClientSecret,
      zohoClientId,
      zohoClientSecret,
      msClientId,
      msClientSecret,
    ],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
    const enterpriseId = request.data?.enterpriseId as string | undefined;
    const agentId = (request.data?.agentId as string | undefined) ?? "ivy";
    const message = (request.data?.message as string | undefined)?.trim();
    const history = (request.data?.history as { role: "user" | "ivy"; text: string }[] | undefined) ?? [];
    if (!enterpriseId || !message) {
      throw new HttpsError("invalid-argument", "Missing enterpriseId or message.");
    }
    const { chatWithAgent } = await import("./agentChat");
    return chatWithAgent(enterpriseId, agentId, message, history, request.auth.uid);
  }
);

/**
 * Human-sent reply from the inbox reading pane. Sends immediately via the
 * conversation's channel (this is a person clicking send, not an agent, so it
 * bypasses the approval gate) and writes the outbound message so it shows at once.
 */
export const sendReply = onCall(
  {
    secrets: [
      googleClientId,
      googleClientSecret,
      zohoClientId,
      zohoClientSecret,
      msClientId,
      msClientSecret,
    ],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
    const enterpriseId = request.data?.enterpriseId as string | undefined;
    const conversationId = request.data?.conversationId as string | undefined;
    const body = (request.data?.body as string | undefined)?.trim();
    if (!enterpriseId || !conversationId || !body) {
      throw new HttpsError("invalid-argument", "Missing enterpriseId, conversationId, or body.");
    }

    const { db, FieldValue } = await import("./admin");
    const convSnap = await db.doc(`conversations/${conversationId}`).get();
    if (!convSnap.exists) throw new HttpsError("not-found", "Conversation not found.");
    const conv = convSnap.data() as Record<string, unknown>;
    const channel = conv.channel as string;

    const targetByChannel: Record<string, string> = {
      "google-workspace": "gmail",
      smtp: "smtp",
      microsoft365: "microsoft365",
      whatsapp: "whatsapp",
    };
    const target = targetByChannel[channel];
    if (!target) throw new HttpsError("failed-precondition", `Cannot reply on channel ${channel}.`);

    const { executeAction } = await import("./executeAgentAction");
    let externalRef: string | null;
    try {
      externalRef = await executeAction(enterpriseId, target, "send_reply", {
        conversationId,
        threadId: conv.thread_id,
        to: conv.customer_ref,
        subject: conv.subject ?? "",
        body,
      });
    } catch (e) {
      // Surface the real provider error (e.g. Meta "API access blocked" = expired token).
      throw new HttpsError("failed-precondition", (e as Error).message || "Send failed.");
    }

    // Reflect the sent message immediately in the unified inbox.
    await db.collection("messages").add({
      conversation_id: conversationId,
      enterprise_id: enterpriseId,
      channel,
      sender_type: "us",
      from: "You",
      from_email: "",
      subject: conv.subject ?? "",
      body,
      snippet: body.slice(0, 200),
      timestamp: new Date(),
      created_at: FieldValue.serverTimestamp(),
    });
    await db.doc(`conversations/${conversationId}`).set(
      { last_message_at: new Date(), updated_at: FieldValue.serverTimestamp() },
      { merge: true }
    );

    return { ok: true, externalRef };
  }
);

/** TEMPORARY — write a tiny file to Storage and return its download URL + bucket, to verify the pipeline. Remove before ship. */
export const pingStorage = onRequest(async (_req, res) => {
  try {
    const { bucket } = await import("./admin");
    const { randomUUID } = await import("crypto");
    const b = bucket();
    const path = `debug/ping-${Date.now()}.txt`;
    const token = randomUUID();
    await b.file(path).save(Buffer.from("ellipse storage ok"), {
      contentType: "text/plain",
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
      resumable: false,
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${b.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    res.json({ ok: true, bucket: b.name, url });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

/** TEMPORARY — inspect what the Mercury Store API returns. ?enterpriseId=&resource=products&limit=200. Remove before ship. */
export const mercuryDebug = onRequest(async (req, res) => {
  const enterpriseId = req.query.enterpriseId as string | undefined;
  const resource = (req.query.resource as string | undefined) ?? "products";
  const limit = Number(req.query.limit ?? 200);
  const q = (req.query.q as string | undefined)?.toLowerCase();
  if (!enterpriseId) {
    res.status(400).json({ ok: false, error: "Missing enterpriseId" });
    return;
  }
  const rawParam = req.query.raw as string | undefined; // e.g. raw=search=lenovo  (probe undocumented params)
  try {
    const { listResource, mercuryRawGet } = await import("./connections/mercury");
    if (rawParam) {
      const data = await mercuryRawGet(enterpriseId, `/v1/${resource}?${rawParam}`);
      const arr = data?.data ?? [];
      res.json({ ok: true, raw: rawParam, count: Array.isArray(arr) ? arr.length : undefined, apiCount: data?.count, total: data?.total, nextCursor: data?.nextCursor, sampleNames: Array.isArray(arr) ? arr.slice(0, 10).map((i: any) => i.name) : data });
      return;
    }
    const { items } = await listResource(enterpriseId, resource, { limit: Math.min(limit, 200) });
    const brands = Array.from(new Set(items.map((i: any) => i.brand).filter(Boolean))).sort();
    const matches = q
      ? items.filter((i: any) => JSON.stringify(i).toLowerCase().includes(q)).map((i: any) => ({ id: i.id, name: i.name, brand: i.brand, stock: i.stock }))
      : undefined;
    res.json({ ok: true, resource, count: items.length, brands, matches, sample: items.slice(0, 3) });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

/** TEMPORARY — verify real leads list. ?enterpriseId=&days=&limit=. Remove before ship. */
export const zohoLeadsDebug = onRequest(
  { secrets: [zohoClientId, zohoClientSecret] },
  async (req, res) => {
    const enterpriseId = req.query.enterpriseId as string | undefined;
    if (!enterpriseId) {
      res.status(400).json({ ok: false, error: "Missing enterpriseId" });
      return;
    }
    try {
      const fields = req.query.fields as string | undefined;
      if (fields) {
        const { debugLeadsRaw } = await import("./connections/zoho");
        const raw = await debugLeadsRaw(enterpriseId, fields);
        res.json({ ok: true, probe: fields, ...raw });
        return;
      }
      const { getLeadsList } = await import("./connections/zoho");
      const leads = await getLeadsList(enterpriseId, {
        days: req.query.days ? Number(req.query.days) : undefined,
        limit: Number(req.query.limit) || 25,
      });
      res.json({ ok: true, count: leads.length, leads });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  }
);

/** TEMPORARY — inspect a recent Zoho quote's line-item structure. ?enterpriseId=. Remove before ship. */
export const zohoQuoteDebug = onRequest(
  { secrets: [zohoClientId, zohoClientSecret] },
  async (req, res) => {
    const enterpriseId = req.query.enterpriseId as string | undefined;
    if (!enterpriseId) {
      res.status(400).json({ ok: false, error: "Missing enterpriseId" });
      return;
    }
    try {
      const { debugRecentQuote } = await import("./connections/zoho");
      res.json({ ok: true, ...(await debugRecentQuote(enterpriseId)) });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  }
);

/** TEMPORARY — render a sample proforma to verify PDF generation. ?enterpriseId=. Remove before ship. */
export const quotationDebug = onRequest(async (req, res) => {
  const enterpriseId = req.query.enterpriseId as string | undefined;
  if (!enterpriseId) {
    res.status(400).json({ ok: false, error: "Missing enterpriseId" });
    return;
  }
  try {
    const { createQuotationPdf } = await import("./quotations");
    const q = await createQuotationPdf({
      enterpriseId,
      agentId: "mercury",
      agentLabel: "Mercury Store Agent",
      logo: "/logos/mercury.png",
      client: {
        name: "TWED PROPERTY DEVELOPMENT LTD",
        address: "",
        tin: "",
        contact_person: "",
        contact_no: "",
        email: "",
      },
      items: [
        { description: "HP 938 Black Original Ink Cartridge", rate: 171911.46, qty: 1 },
        { description: "HP 936 Yellow Ink Cartridge (C4837A)", rate: 140436.29, qty: 1 },
        { description: "HP 938 Magenta Original Ink Cartridge", rate: 140436.29, qty: 1 },
        { description: "HP 938 Cyan Original Ink Cartridge", rate: 140436.29, qty: 1 },
      ],
      currency: "UGX",
    });
    res.json({ ok: true, ...q });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message, stack: (e as Error).stack });
  }
});

/** Connect the Mercury Store API — verifies the key with a read probe, then stores it. */
export const connectMercury = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const d = request.data ?? {};
  const enterpriseId = d.enterpriseId as string | undefined;
  const apiKey = (d.apiKey as string | undefined)?.trim();
  const baseUrl = (d.baseUrl as string | undefined)?.trim() || undefined;
  if (!enterpriseId || !apiKey) {
    throw new HttpsError("invalid-argument", "Missing enterpriseId or apiKey.");
  }
  const { saveMercuryConnection } = await import("./connections/mercury");
  try {
    await saveMercuryConnection(enterpriseId, apiKey, baseUrl);
  } catch (e) {
    throw new HttpsError("failed-precondition", `Connection failed: ${(e as Error).message}`);
  }
  return { ok: true };
});

/**
 * Ingest a knowledge-base file (PDF, image, or text) uploaded from Settings.
 * Stores the original file, extracts its text (via Gemini for PDF/images) so
 * agents can use it as context, and writes a `knowledge_base` entry.
 * data: { enterpriseId, fileName, fileType (mime), dataBase64, title? }
 */
export const ingestKnowledgeFile = onCall(
  { secrets: [geminiKey], memory: "512MiB", timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
    const d = request.data ?? {};
    const enterpriseId = d.enterpriseId as string | undefined;
    const fileName = (d.fileName as string | undefined)?.trim();
    const fileType = (d.fileType as string | undefined)?.trim() || "application/octet-stream";
    const dataBase64 = d.dataBase64 as string | undefined;
    const title = (d.title as string | undefined)?.trim() || fileName;
    if (!enterpriseId || !fileName || !dataBase64) {
      throw new HttpsError("invalid-argument", "Missing enterpriseId, fileName or dataBase64.");
    }

    const buffer = Buffer.from(dataBase64, "base64");
    const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
    if (buffer.length > MAX_BYTES) {
      throw new HttpsError("invalid-argument", "File too large (max 15 MB).");
    }

    const { db, bucket, FieldValue } = await import("./admin");
    const { randomUUID } = await import("crypto");

    // Store the original file.
    const docRef = db.collection("knowledge_base").doc();
    const safeName = fileName.replace(/[^\w.\-]+/g, "_");
    const path = `knowledge_base/${enterpriseId}/${docRef.id}/${safeName}`;
    const b = bucket();
    const token = randomUUID();
    await b.file(path).save(buffer, {
      contentType: fileType,
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
      resumable: false,
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${b.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

    // Extract text content the agents can read.
    let content = "";
    if (fileType === "application/pdf" || fileType.startsWith("image/")) {
      const { extractTextFromFile } = await import("./gemini");
      content = await extractTextFromFile(dataBase64, fileType);
    } else if (fileType.startsWith("text/") || fileType === "application/json") {
      content = buffer.toString("utf8");
    } else {
      // Best effort for anything else (e.g. odd mime types on PDFs).
      const { extractTextFromFile } = await import("./gemini");
      content = await extractTextFromFile(dataBase64, "application/pdf");
    }
    content = content.trim().slice(0, 20000);

    await docRef.set({
      enterprise_id: enterpriseId,
      title,
      content,
      source: "file",
      file: { name: fileName, url, type: fileType, size: buffer.length },
      created_at: FieldValue.serverTimestamp(),
    });

    return { ok: true, id: docRef.id, extracted: content.length, url };
  }
);

/**
 * Save the org's quotation / proforma branding (letterhead). Owner-only.
 * Accepts company details + optional logo (base64). Used by the quotation PDF generator.
 * data: { enterpriseId, company_name, tin, address, phones, email, website,
 *         prepared_by, vat_rate, review_link, terms, proforma_prefix, proforma_start?,
 *         logoBase64?, logoType?, logoName? }
 */
export const saveQuotationBranding = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const d = request.data ?? {};
  const enterpriseId = d.enterpriseId as string | undefined;
  if (!enterpriseId) throw new HttpsError("invalid-argument", "Missing enterpriseId.");

  const { db, bucket, FieldValue } = await import("./admin");
  const { randomUUID } = await import("crypto");

  // Owner gate.
  const uSnap = await db.doc(`users/${request.auth.uid}`).get();
  const u = uSnap.data();
  if (!u || u.enterprise_id !== enterpriseId || u.role !== "owner") {
    throw new HttpsError("permission-denied", "Only the organization owner can edit quotation branding.");
  }

  const update: Record<string, unknown> = {
    enterprise_id: enterpriseId,
    updated_at: FieldValue.serverTimestamp(),
  };
  const strFields = [
    "company_name",
    "tin",
    "address",
    "phones",
    "email",
    "website",
    "prepared_by",
    "review_link",
    "terms",
    "proforma_prefix",
  ];
  for (const f of strFields) {
    if (typeof d[f] === "string") update[f] = (d[f] as string).trim();
  }
  if (d.vat_rate !== undefined && d.vat_rate !== null && d.vat_rate !== "") {
    update.vat_rate = Number(d.vat_rate);
  }
  if (d.proforma_start !== undefined && d.proforma_start !== null && d.proforma_start !== "") {
    // Next number issued will be proforma_start.
    update.proforma_seq = Math.max(0, Number(d.proforma_start) - 1);
  }

  // Optional logo upload.
  const logoBase64 = d.logoBase64 as string | undefined;
  if (logoBase64) {
    const logoType = (d.logoType as string | undefined) || "image/png";
    const logoName = ((d.logoName as string | undefined) || "logo.png").replace(/[^\w.\-]+/g, "_");
    const buffer = Buffer.from(logoBase64, "base64");
    if (buffer.length > 5 * 1024 * 1024) throw new HttpsError("invalid-argument", "Logo too large (max 5 MB).");
    const b = bucket();
    const path = `quotation_settings/${enterpriseId}/${randomUUID()}-${logoName}`;
    const token = randomUUID();
    await b.file(path).save(buffer, {
      contentType: logoType,
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
      resumable: false,
    });
    update.logo_url = `https://firebasestorage.googleapis.com/v0/b/${b.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    update.logo_path = path;
  }

  await db.doc(`quotation_settings/${enterpriseId}`).set(update, { merge: true });
  return { ok: true, logo_url: update.logo_url };
});

/**
 * Link a freshly signed-up user to the org that invited them, so invited
 * employees join the right workspace instead of creating a new one.
 * Matches a pending invite by the authenticated user's own (verified) email,
 * sets their enterprise/role/can_approve, and marks the invite accepted.
 */
export const acceptInvite = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const uid = request.auth.uid;
  const email = (request.auth.token?.email as string | undefined)?.trim().toLowerCase();

  const { db, FieldValue } = await import("./admin");

  // Already a member of an org? Nothing to do.
  const uRef = db.doc(`users/${uid}`);
  const uSnap = await uRef.get();
  const existing = uSnap.data()?.enterprise_id as string | undefined;
  if (existing) return { ok: true, alreadyMember: true, enterpriseId: existing };

  if (!email) return { ok: false, reason: "no_email" };

  // Find a pending invite for this email.
  const invQ = await db
    .collection("invites")
    .where("email", "==", email)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (invQ.empty) return { ok: false, reason: "no_invite" };

  const invDoc = invQ.docs[0];
  const inv = invDoc.data();
  const enterpriseId = inv.enterprise_id as string;

  // Seat-limit re-check (Starter 1 / Business 5 / Enterprise unlimited).
  const entSnap = await db.doc(`enterprises/${enterpriseId}`).get();
  if (!entSnap.exists) return { ok: false, reason: "org_missing" };
  const tier = (entSnap.data()?.subscription_tier as string) ?? "business";
  const seatLimits: Record<string, number> = { starter: 1, business: 5, enterprise: 999 };
  const limit = seatLimits[tier] ?? 5;
  const membersSnap = await db.collection("users").where("enterprise_id", "==", enterpriseId).get();
  const activeMembers = membersSnap.docs.filter((d) => (d.data().status ?? "active") !== "disabled").length;
  if (activeMembers >= limit) {
    return { ok: false, reason: "seat_limit", limit };
  }

  // Link the user to the org with the invited role.
  await uRef.set(
    {
      enterprise_id: enterpriseId,
      role: (inv.role as string) || "employee",
      can_approve: !!inv.can_approve,
      status: "active",
      joined_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  await invDoc.ref.update({
    status: "accepted",
    accepted_uid: uid,
    accepted_at: FieldValue.serverTimestamp(),
  });

  return { ok: true, enterpriseId, role: (inv.role as string) || "employee" };
});

// ---- Team member management (owner/admin, role-checked in ./members) ----

export const inviteMember = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const { inviteMember } = await import("./members");
  return inviteMember(request.auth.uid, request.data ?? {});
});

export const updateMemberRole = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const { updateMemberRole } = await import("./members");
  return updateMemberRole(request.auth.uid, request.data ?? {});
});

export const setMemberCanApprove = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const { setCanApprove } = await import("./members");
  return setCanApprove(request.auth.uid, request.data ?? {});
});

export const removeMember = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const { removeMember } = await import("./members");
  return removeMember(request.auth.uid, request.data ?? {});
});

export const revokeInvite = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const { revokeInvite } = await import("./members");
  return revokeInvite(request.auth.uid, request.data ?? {});
});

// ---- Shared-integration access (request / approve; role-checked in ./access) ----

export const requestSharedAccess = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const { requestSharedAccess } = await import("./access");
  return requestSharedAccess(request.auth.uid, request.data ?? {});
});

export const respondAccessRequest = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const { respondAccessRequest } = await import("./access");
  return respondAccessRequest(request.auth.uid, request.data ?? {});
});

export const revokeSharedAccess = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const { revokeSharedAccess } = await import("./access");
  return revokeSharedAccess(request.auth.uid, request.data ?? {});
});

/** Disconnect an integration and purge all data it produced (analytics, messages, sites). */
export const disconnectIntegration = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const enterpriseId = request.data?.enterpriseId as string | undefined;
  const type = request.data?.type as string | undefined;
  if (!enterpriseId || !type) throw new HttpsError("invalid-argument", "Missing enterpriseId or type.");
  const { disconnectIntegration: run } = await import("./disconnect");
  return run(enterpriseId, type);
});

/** TEMPORARY — generate a detailed CRM report file and return its URL, to inspect contents. Remove before ship. */
export const reportGenDebug = onRequest(
  { secrets: [zohoClientId, zohoClientSecret] },
  async (req, res) => {
    const enterpriseId = req.query.enterpriseId as string | undefined;
    if (!enterpriseId) {
      res.status(400).json({ ok: false, error: "Missing enterpriseId" });
      return;
    }
    try {
      const now = new Date();
      const start = new Date(now.getTime() - 7 * 86400000);
      const { getCrmReportData, getQuotesDetailed } = await import("./connections/zoho");
      const { createCrmReport } = await import("./documents");
      const base = await getCrmReportData(enterpriseId, start, now);
      const quotes = await getQuotesDetailed(enterpriseId, start, now);
      const docs = await createCrmReport({
        enterpriseId,
        agentId: "zoho-agent",
        agentLabel: "Zoho CRM Agent",
        logo: "/logos/zoho.png",
        periodLabel: "Last 7 days Detailed",
        data: { ...base, quotes },
      });
      res.json({ ok: true, quotes_count: quotes.length, files: docs });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  }
);

/** TEMPORARY — list a module's field api_names + labels. ?enterpriseId=&module=Quotes. Remove before ship. */
export const zohoFieldsDebug = onRequest(
  { secrets: [zohoClientId, zohoClientSecret] },
  async (req, res) => {
    const enterpriseId = req.query.enterpriseId as string | undefined;
    const module = (req.query.module as string | undefined) ?? "Quotes";
    if (!enterpriseId) {
      res.status(400).json({ ok: false, error: "Missing enterpriseId" });
      return;
    }
    try {
      const { listModuleFields } = await import("./connections/zoho");
      const fields = await listModuleFields(enterpriseId, module);
      res.json({ ok: true, module, count: fields.length, fields });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  }
);

/** TEMPORARY — dump raw CRM report data for fact-checking. ?enterpriseId=&period=week. Remove before ship. */
export const crmReportDebug = onRequest(
  { secrets: [zohoClientId, zohoClientSecret] },
  async (req, res) => {
    const enterpriseId = req.query.enterpriseId as string | undefined;
    const period = (req.query.period as string | undefined) ?? "week";
    if (!enterpriseId) {
      res.status(400).json({ ok: false, error: "Missing enterpriseId" });
      return;
    }
    try {
      const now = new Date();
      const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
      let start = startOfDay(now);
      if (period === "week") start = new Date(now.getTime() - 7 * 86400000);
      else if (period === "month") start = new Date(now.getTime() - 30 * 86400000);
      const { getCrmReportData, getQuotesDetailed } = await import("./connections/zoho");
      const data = (await getCrmReportData(enterpriseId, start, now)) as any;
      if ((req.query.detail as string) === "detailed") {
        data.quotes = await getQuotesDetailed(enterpriseId, start, now);
      }
      res.json({ ok: true, enterpriseId, period, window: { start: start.toISOString(), end: now.toISOString() }, data });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  }
);

export { executeAgentAction };
export { onPendingActionApproved } from "./approvals";
export { onMessageCreated } from "./onMessage";
