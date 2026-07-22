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

export { executeAgentAction };
export { onPendingActionApproved } from "./approvals";
export { onMessageCreated } from "./onMessage";
