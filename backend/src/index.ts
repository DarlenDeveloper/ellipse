import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import "./admin";
import { executeAction, executeAgentAction } from "./executeAgentAction";
import { ExecuteAgentActionInput } from "./types";
import { sanitizeEmailHtml } from "./emailHtml";

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

async function requireOrgManager(uid: string, enterpriseId: string) {
  const { db } = await import("./admin");
  const user = (await db.doc(`users/${uid}`).get()).data();
  if (user?.enterprise_id !== enterpriseId) throw new HttpsError("permission-denied", "Wrong organization.");
  if (user.role !== "owner" && user.role !== "admin") {
    throw new HttpsError("permission-denied", "Only an owner or admin can manage company integrations.");
  }
  return user;
}

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
  const caller = (await (await import("./admin")).db.doc(`users/${request.auth.uid}`).get()).data();
  if (caller?.enterprise_id !== data.enterpriseId) throw new HttpsError("permission-denied", "Wrong organization.");

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

    const userSnap = await (await import("./admin")).db.doc(`users/${request.auth.uid}`).get();
    if (userSnap.data()?.enterprise_id !== enterpriseId) throw new HttpsError("permission-denied", "Wrong organization.");
    const personal = request.data?.scope === "personal";
    const role = userSnap.data()?.role as string | undefined;
    if (!personal && role !== "owner" && role !== "admin") {
      throw new HttpsError("permission-denied", "Only an owner or admin can connect a company account.");
    }

    const { randomUUID } = await import("crypto");
    const { db, FieldValue } = await import("./admin");
    const state = randomUUID();
    await db.doc(`oauth_states/${state}`).set({
      provider: "google-workspace",
      enterprise_id: enterpriseId,
      owner_uid: personal ? request.auth.uid : null,
      scope: personal ? "personal" : "org",
      created_at: FieldValue.serverTimestamp(),
      expires_at: new Date(Date.now() + 10 * 60_000),
    });

    const { buildConsentUrl } = await import("./connections/google");
    return { url: buildConsentUrl(state) };
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
    const state = req.query.state as string | undefined;

    if (!code || !state) {
      res.redirect(`${FRONTEND_URL}/integrations?google=error`);
      return;
    }

    try {
      const { db } = await import("./admin");
      const stateRef = db.doc(`oauth_states/${state}`);
      const stateSnap = await stateRef.get();
      const oauthState = stateSnap.data();
      await stateRef.delete().catch(() => undefined);
      const expiresAt = oauthState?.expires_at?.toDate?.()?.getTime?.() ?? 0;
      if (!oauthState || oauthState.provider !== "google-workspace" || expiresAt < Date.now()) {
        throw new Error("Invalid or expired OAuth state");
      }
      const { handleCallback } = await import("./connections/google");
      await handleCallback(code, oauthState.enterprise_id, oauthState.scope === "personal" ? oauthState.owner_uid : undefined);
      res.redirect(`${FRONTEND_URL}/integrations?google=connected${oauthState.scope === "personal" ? "&scope=personal" : ""}`);
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

    const user = (await (await import("./admin")).db.doc(`users/${request.auth.uid}`).get()).data();
    if (user?.enterprise_id !== enterpriseId) throw new HttpsError("permission-denied", "Wrong organization.");
    // Connection scope is chosen when OAuth is connected; role does not define
    // whether a mailbox is personal. Owners and admins can also connect a
    // personal mailbox, so preserve the explicit inbox scope during refresh.
    const requestedScope = request.data?.scope === "personal" ? "personal" : "org";
    const ownerUid = requestedScope === "personal" ? request.auth.uid : undefined;
    const connectionId = `${enterpriseId}_google-workspace${ownerUid ? `_personal_${ownerUid}` : ""}`;
    const connection = await (await import("./admin")).db.doc(`connections/${connectionId}`).get();
    if (!connection.exists || connection.data()?.status !== "active") {
      throw new HttpsError("failed-precondition", `${requestedScope === "personal" ? "Personal" : "Organization"} Gmail is not connected.`);
    }

    const { ingestRecentGmail } = await import("./connections/google");
    const count = await ingestRecentGmail(enterpriseId, 15, ownerUid);
    return { ingested: count };
  }
);

/**
 * Auto-sync — pulls new Gmail for every connected account every 10 minutes so
 * users don't have to press the Sync button. The inbox updates live via
 * onSnapshot, so new messages just appear.
 */
export const scheduledGmailSync = onSchedule(
  { schedule: "every 10 minutes", secrets: [googleClientId, googleClientSecret] },
  async () => {
    const { syncAllConnectedGmail } = await import("./connections/google");
    const ingested = await syncAllConnectedGmail();
    logger.info("scheduledGmailSync complete", { ingested });
  }
);

/** Auto-sync all connected SMTP/IMAP mailboxes every 10 minutes. */
export const scheduledImapSync = onSchedule({ schedule: "every 10 minutes" }, async () => {
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

/** Auto-sync all connected Outlook accounts every 10 minutes. */
export const scheduledOutlookSync = onSchedule(
  { schedule: "every 10 minutes", secrets: [msClientId, msClientSecret] },
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
  await requireOrgManager(request.auth.uid, enterpriseId);
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
  await requireOrgManager(request.auth.uid, enterpriseId);
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
  await requireOrgManager(request.auth.uid, enterpriseId);
  const { registerWebsite: reg } = await import("./connections/web");
  return reg(enterpriseId, domain);
});

/** Verify the tracking tag is live on the given URL, then activate the connection. */
export const verifyWebsiteInstall = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const enterpriseId = request.data?.enterpriseId as string | undefined;
  if (!enterpriseId) throw new HttpsError("invalid-argument", "Missing enterpriseId.");
  await requireOrgManager(request.auth.uid, enterpriseId);
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
    await requireOrgManager(request.auth.uid, enterpriseId);
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

    const { db, FieldValue } = await import("./admin");
    const user = (await db.doc(`users/${request.auth.uid}`).get()).data();
    if (user?.enterprise_id !== enterpriseId) throw new HttpsError("permission-denied", "Wrong organization.");
    const personal = request.data?.scope === "personal";
    if (!personal && user?.role !== "owner" && user?.role !== "admin") {
      throw new HttpsError("permission-denied", "Only an owner or admin can connect company Zoho.");
    }
    const { randomUUID } = await import("crypto");
    const state = randomUUID();
    await db.doc(`oauth_states/${state}`).set({
      provider: "zoho",
      enterprise_id: enterpriseId,
      owner_uid: personal ? request.auth.uid : null,
      scope: personal ? "personal" : "org",
      created_at: FieldValue.serverTimestamp(),
      expires_at: new Date(Date.now() + 10 * 60_000),
    });

    const { buildConsentUrl } = await import("./connections/zoho");
    return { url: buildConsentUrl(state) };
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
    const state = req.query.state as string | undefined;
    const accountsServer = req.query["accounts-server"] as string | undefined;

    if (!code || !state) {
      res.redirect(`${FRONTEND_URL}/integrations?zoho=error`);
      return;
    }

    try {
      const { db } = await import("./admin");
      const stateRef = db.doc(`oauth_states/${state}`);
      const stateSnap = await stateRef.get();
      const oauthState = stateSnap.data();
      await stateRef.delete().catch(() => undefined);
      const expiresAt = oauthState?.expires_at?.toDate?.()?.getTime?.() ?? 0;
      if (!oauthState || oauthState.provider !== "zoho" || expiresAt < Date.now()) throw new Error("Invalid or expired OAuth state");
      const { handleCallback } = await import("./connections/zoho");
      await handleCallback(code, oauthState.enterprise_id, accountsServer, oauthState.scope === "personal" ? oauthState.owner_uid : undefined);
      res.redirect(`${FRONTEND_URL}/integrations?zoho=connected${oauthState.scope === "personal" ? "&scope=personal" : ""}`);
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
    const { generateDueReports, notifyDueOwnerReports } = await import("./reports");
    const [reports, ownerNotifications] = await Promise.all([
      generateDueReports(),
      notifyDueOwnerReports(),
    ]);
    logger.info("scheduledReports complete", { reports, ownerNotifications });
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
    const history = (request.data?.history as { role: "user" | "ivy"; text: string; actions?: { name: string; args?: Record<string, unknown>; result?: string }[] }[] | undefined) ?? [];
    if (!enterpriseId || !message) {
      throw new HttpsError("invalid-argument", "Missing enterpriseId or message.");
    }
    const { chatWithAgent } = await import("./agentChat");
    return chatWithAgent(enterpriseId, agentId, message, history, request.auth.uid);
  }
);

/** Cached, authenticated home-dashboard payload. */
export const getDashboardData = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const enterpriseId = request.data?.enterpriseId as string | undefined;
  if (!enterpriseId) throw new HttpsError("invalid-argument", "Missing enterpriseId.");
  return (await import("./dashboard")).getDashboardData(enterpriseId, request.auth.uid);
});

/**
 * Returns a short-lived URL after authorizing the caller against the owning
 * organization, personal scope, role, connection grant, and exact file record.
 */
export const getSecureDownload = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const { createSecureDownload } = await import("./secureDownloads");
  return createSecureDownload(request.auth.uid, request.data ?? {});
});

export const listApprovals = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  return (await import("./approvals")).listApprovals(request.auth.uid, request.data ?? {});
});

export const rejectAllPendingApprovals = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  return (await import("./approvals")).rejectAllPending(request.auth.uid);
});

/** Extract structured task proposals from an inbox conversation. */
export const extractConversationTasks = onCall({ secrets: [geminiKey] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const { extractConversationTasks } = await import("./tasks");
  return extractConversationTasks(request.auth.uid, request.data ?? {});
});

/** Human-confirmed task creation. */
export const createTask = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const { createTask } = await import("./tasks");
  return createTask(request.auth.uid, request.data ?? {});
});

/** Update status, priority, ownership, due date, or task content. */
export const updateTask = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const { updateTask } = await import("./tasks");
  return updateTask(request.auth.uid, request.data ?? {});
});

/** Create a private Ellipse calendar event for the signed-in employee. */
export const createCalendarEvent = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const { createCalendarEvent } = await import("./calendar");
  return createCalendarEvent(request.auth.uid, request.data ?? {});
});

export const updateCalendarEvent = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const { updateCalendarEvent } = await import("./calendar");
  return updateCalendarEvent(request.auth.uid, request.data ?? {});
});

/** Mark a conversation as read for the signed-in user. */
export const markConversationRead = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const { markConversationRead } = await import("./inbox");
  return markConversationRead(request.auth.uid, request.data ?? {});
});

export const listInboxConversations = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  return (await import("./inbox")).listInboxConversations(request.auth.uid, request.data ?? {});
});

export const ensureTeamChat = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const chat = await import("./internalChat");
  return chat.ensureTeamChat(request.auth.uid);
});

export const startInternalChat = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const chat = await import("./internalChat");
  return chat.startInternalChat(request.auth.uid, request.data ?? {});
});

export const sendInternalMessage = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const chat = await import("./internalChat");
  return chat.sendInternalMessage(request.auth.uid, request.data ?? {});
});

export const prepareInternalChatAttachment = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const chat = await import("./internalChat");
  return chat.prepareInternalChatAttachment(request.auth.uid, request.data ?? {});
});

export const finalizeInternalChatAttachment = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const chat = await import("./internalChat");
  return chat.finalizeInternalChatAttachment(request.auth.uid, request.data ?? {});
});

export const markInternalChatRead = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const chat = await import("./internalChat");
  return chat.markInternalChatRead(request.auth.uid, request.data ?? {});
});

/** Human-composed Inbox reply. An explicit user click sends immediately. */
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
    const bodyHtml = sanitizeEmailHtml(request.data?.bodyHtml as string | undefined);
    const cc = (request.data?.cc as string | undefined)?.trim() || undefined;
    const attachment = request.data?.attachment as { documentId?: string; storagePath?: string; fileName?: string; contentType?: string; size?: number } | undefined;
    if (!enterpriseId || !conversationId || !body) {
      throw new HttpsError("invalid-argument", "Missing enterpriseId, conversationId, or body.");
    }
    if (cc && !cc.split(",").every((address) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.trim()))) {
      throw new HttpsError("invalid-argument", "Enter valid comma-separated CC email addresses.");
    }

    const { db, FieldValue } = await import("./admin");
    const caller = (await db.doc(`users/${request.auth.uid}`).get()).data();
    if (caller?.enterprise_id !== enterpriseId) throw new HttpsError("permission-denied", "Wrong organization.");
    if (attachment) {
      if (!attachment.documentId || !attachment.storagePath?.startsWith(`documents/${enterpriseId}/${attachment.documentId}/`)) {
        throw new HttpsError("permission-denied", "Invalid attachment location.");
      }
      const attachmentDoc = (await db.doc(`documents/${attachment.documentId}`).get()).data();
      if (attachmentDoc?.enterprise_id !== enterpriseId || attachmentDoc?.storage_path !== attachment.storagePath) {
        throw new HttpsError("permission-denied", "Attachment does not belong to this organization.");
      }
    }
    const convSnap = await db.doc(`conversations/${conversationId}`).get();
    if (!convSnap.exists) throw new HttpsError("not-found", "Conversation not found.");
    const conv = convSnap.data() as Record<string, unknown>;
    if (conv.enterprise_id !== enterpriseId) throw new HttpsError("permission-denied", "Conversation belongs to another organization.");
    const channel = conv.channel as string;
    const isManager = caller.role === "owner" || caller.role === "admin";
    if (conv.connection_scope === "personal") {
      if (conv.owner_uid !== request.auth.uid) throw new HttpsError("permission-denied", "This is another employee's personal conversation.");
    } else if (!isManager) {
      const grant = (await db.doc(`connection_grants/${enterpriseId}_${request.auth.uid}`).get()).data();
      if (!((grant?.types as string[] | undefined) ?? []).includes(channel)) {
        throw new HttpsError("permission-denied", "You do not have access to this company connection.");
      }
    }

    const targetByChannel: Record<string, string> = {
      "google-workspace": "gmail",
      smtp: "smtp",
      microsoft365: "microsoft365",
      whatsapp: "whatsapp",
    };
    const target = targetByChannel[channel];
    if (!target) throw new HttpsError("failed-precondition", `Cannot reply on channel ${channel}.`);

    const actionParams = {
        conversationId,
        threadId: conv.thread_id,
        to: conv.customer_ref,
        subject: conv.subject ?? "",
        body,
        bodyHtml,
        cc,
        attachment,
        connectionOwnerUid: conv.connection_scope === "personal" ? conv.owner_uid : undefined,
        humanInitiated: true,
        senderUid: request.auth.uid,
        connectionScope: conv.connection_scope ?? "org",
        ownerUid: conv.connection_scope === "personal" ? conv.owner_uid : null,
      };
    // This is a user-authored action, not an autonomous agent action. Agent
    // modes (Off/Supervised/Unsupervised) must never suppress or re-queue an
    // explicit click on Send. Keep an audit record without passing through the
    // agent approval gate.
    const auditRef = db.collection("pending_actions").doc();
    await auditRef.set({
      enterprise_id: enterpriseId,
      agent_id: `human-${request.auth.uid}`,
      domain: "inbox",
      action_type: "send_reply",
      params: actionParams,
      target_system: target,
      status: "executing",
      action_summary: `Direct reply to ${String(conv.customer_ref ?? "customer")} from the Inbox.`,
      created_at: FieldValue.serverTimestamp(),
    });

    try {
      const externalRef = await executeAction(enterpriseId, target, "send_reply", actionParams);
      await auditRef.update({
        status: "executed",
        external_ref: externalRef,
        executed_at: FieldValue.serverTimestamp(),
      });
      await db.collection("messages").add({
        conversation_id: conversationId, enterprise_id: enterpriseId, channel,
        sender_type: "us", from: "You", from_email: "", subject: conv.subject ?? "",
        body, body_html: bodyHtml ?? null, snippet: body.slice(0, 200), timestamp: new Date(), created_at: FieldValue.serverTimestamp(),
        cc: cc ?? null, attachment: attachment ?? null,
        connection_scope: actionParams.connectionScope, owner_uid: actionParams.ownerUid,
      });
      await db.doc(`conversations/${conversationId}`).set(
        { last_message_at: new Date(), updated_at: FieldValue.serverTimestamp() }, { merge: true }
      );
      return { ok: true, status: "executed", pendingActionId: auditRef.id, externalRef };
    } catch (error) {
      const message = (error as Error).message || "The connected channel rejected the reply.";
      await auditRef.update({
        status: "error",
        error: message,
        executed_at: FieldValue.serverTimestamp(),
      });
      logger.error("Direct Inbox reply failed", { enterpriseId, conversationId, channel, error: message });
      throw new HttpsError("unavailable", message);
    }
  }
);

/** User-composed brand-new email; sends immediately and keeps an audit record. */
export const sendDirectEmail = onCall(
  { secrets: [googleClientId, googleClientSecret, msClientId, msClientSecret] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
    const enterpriseId = String(request.data?.enterpriseId ?? "");
    const channel = String(request.data?.channel ?? "");
    const scope = request.data?.scope === "personal" ? "personal" : "org";
    const to = String(request.data?.to ?? "").trim();
    const cc = String(request.data?.cc ?? "").trim() || undefined;
    const subject = String(request.data?.subject ?? "").trim();
    const body = String(request.data?.body ?? "").trim();
    const bodyHtml = sanitizeEmailHtml(request.data?.bodyHtml as string | undefined);
    const attachment = request.data?.attachment as { documentId?: string; storagePath?: string; fileName?: string; contentType?: string; size?: number } | undefined;
    const addressesValid = (value: string) => value.split(",").every((address) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.trim()));
    if (!enterpriseId || !to || !subject || !body || !addressesValid(to) || (cc && !addressesValid(cc))) throw new HttpsError("invalid-argument", "Enter valid recipients, subject, and message.");
    const targetByChannel: Record<string, string> = { "google-workspace": "gmail", smtp: "smtp", microsoft365: "microsoft365" };
    const target = targetByChannel[channel];
    if (!target) throw new HttpsError("invalid-argument", "Choose a connected email provider.");
    const { db, FieldValue } = await import("./admin");
    const caller = (await db.doc(`users/${request.auth.uid}`).get()).data();
    if (caller?.enterprise_id !== enterpriseId) throw new HttpsError("permission-denied", "Wrong organization.");
    const manager = caller.role === "owner" || caller.role === "admin";
    if (scope === "org" && !manager) {
      const grant = (await db.doc(`connection_grants/${enterpriseId}_${request.auth.uid}`).get()).data();
      if (!((grant?.types as string[] | undefined) ?? []).includes(channel)) throw new HttpsError("permission-denied", "You do not have access to this company connection.");
    }
    if (attachment) {
      if (!attachment.documentId || !attachment.storagePath?.startsWith(`documents/${enterpriseId}/${attachment.documentId}/`)) throw new HttpsError("permission-denied", "Invalid attachment location.");
      const stored = (await db.doc(`documents/${attachment.documentId}`).get()).data();
      if (stored?.enterprise_id !== enterpriseId || stored?.storage_path !== attachment.storagePath) throw new HttpsError("permission-denied", "Attachment does not belong to this organization.");
    }
    const params = {
      to,
      subject,
      body,
      ...(cc ? { cc } : {}),
      ...(bodyHtml ? { bodyHtml } : {}),
      ...(attachment ? { attachment } : {}),
      ...(scope === "personal" ? { connectionOwnerUid: request.auth.uid } : {}),
    };
    const audit = db.collection("pending_actions").doc();
    await audit.set({ enterprise_id: enterpriseId, agent_id: `human-${request.auth.uid}`, domain: "inbox", action_type: "send_email", params, target_system: target, status: "executing", action_summary: `Direct email to ${to}.`, created_at: FieldValue.serverTimestamp() });
    try {
      const externalRef = await executeAction(enterpriseId, target, "send_email", params);
      await audit.update({ status: "executed", external_ref: externalRef, executed_at: FieldValue.serverTimestamp() });
      return { ok: true, status: "executed", externalRef };
    } catch (error) {
      const message = (error as Error).message || "The connected channel rejected the email.";
      await audit.update({ status: "error", error: message, executed_at: FieldValue.serverTimestamp() });
      throw new HttpsError("unavailable", message);
    }
  }
);

const MAX_INBOX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

/** Prepare a direct-to-Storage upload so large files do not cross callable limits. */
export const prepareInboxAttachment = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const enterpriseId = request.data?.enterpriseId as string | undefined;
  const originalName = (request.data?.fileName as string | undefined)?.trim();
  const contentType = (request.data?.contentType as string | undefined)?.trim() || "application/octet-stream";
  const size = Number(request.data?.size ?? 0);
  if (!enterpriseId || !originalName || !size) throw new HttpsError("invalid-argument", "Missing attachment data.");
  if (size > MAX_INBOX_ATTACHMENT_BYTES) throw new HttpsError("invalid-argument", "Attachment must be 100 MB or smaller.");
  const { db, bucket } = await import("./admin");
  const caller = (await db.doc(`users/${request.auth.uid}`).get()).data();
  if (caller?.enterprise_id !== enterpriseId) throw new HttpsError("permission-denied", "Wrong organization.");
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "attachment";
  const docRef = db.collection("documents").doc();
  const storagePath = `documents/${enterpriseId}/${docRef.id}/${safeName}`;
  const [uploadUrl] = await bucket().file(storagePath).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });
  return { documentId: docRef.id, storagePath, fileName: originalName, contentType, size, uploadUrl };
});

/** Verify a direct upload and register it as an Ellipse document. */
export const finalizeInboxAttachment = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const enterpriseId = request.data?.enterpriseId as string | undefined;
  const documentId = request.data?.documentId as string | undefined;
  const storagePath = request.data?.storagePath as string | undefined;
  const originalName = (request.data?.fileName as string | undefined)?.trim();
  const contentType = (request.data?.contentType as string | undefined)?.trim() || "application/octet-stream";
  if (!enterpriseId || !documentId || !storagePath || !originalName) throw new HttpsError("invalid-argument", "Missing attachment data.");
  if (storagePath !== `documents/${enterpriseId}/${documentId}/${storagePath.split("/").pop()}`) {
    throw new HttpsError("permission-denied", "Invalid attachment location.");
  }
  const { db, bucket, FieldValue } = await import("./admin");
  const caller = (await db.doc(`users/${request.auth.uid}`).get()).data();
  if (caller?.enterprise_id !== enterpriseId) throw new HttpsError("permission-denied", "Wrong organization.");
  const file = bucket().file(storagePath);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size ?? 0);
  if (!size || size > MAX_INBOX_ATTACHMENT_BYTES) {
    await file.delete({ ignoreNotFound: true });
    throw new HttpsError("invalid-argument", "Attachment must be 100 MB or smaller.");
  }
  const { randomUUID } = await import("crypto");
  const token = randomUUID();
  await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket().name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
  const docRef = db.doc(`documents/${documentId}`);
  await docRef.set({
    enterprise_id: enterpriseId,
    name: originalName,
    file: { name: originalName, size, url },
    content_type: contentType,
    storage_path: storagePath,
    type: "email_attachment",
    source: "inbox",
    created_by_uid: request.auth.uid,
    created_at: FieldValue.serverTimestamp(),
  });
  return { documentId, storagePath, fileName: originalName, contentType, size, url };
});

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

/** ONE-TIME — move secret fields out of connections docs into connection_secrets, then strip them. Remove after running. */
export const migrateConnectionSecrets = onRequest(async (_req, res) => {
  try {
    const { db, FieldValue } = await import("./admin");
    const { SECRET_FIELDS, saveConnectionSecret } = await import("./connectionSecrets");
    const snap = await db.collection("connections").get();
    let moved = 0;
    for (const d of snap.docs) {
      const data = d.data();
      const secret: Record<string, unknown> = {};
      const strip: Record<string, unknown> = {};
      for (const f of SECRET_FIELDS) {
        if (data[f] !== undefined) {
          secret[f] = data[f];
          strip[f] = FieldValue.delete();
        }
      }
      if (Object.keys(secret).length) {
        await saveConnectionSecret(data.enterprise_id, data.type, secret);
        await d.ref.update(strip);
        moved++;
      }
    }
    res.json({ ok: true, connections: snap.size, migrated: moved });
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
  await requireOrgManager(request.auth.uid, enterpriseId);
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
 *         vat_rate, review_link, terms, proforma_prefix, proforma_start?,
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
    "review_link",
    "terms",
    "proforma_prefix",
    "zoho_mail_merge_template",
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

export const setConnectionGrants = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const { setConnectionGrants } = await import("./access");
  return setConnectionGrants(request.auth.uid, request.data ?? {});
});

export const registerPushToken = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const token = String(request.data?.token ?? "").trim();
  if (!token) throw new HttpsError("invalid-argument", "Missing push token.");
  const user = (await (await import("./admin")).db.doc(`users/${request.auth.uid}`).get()).data();
  if (!user?.enterprise_id) throw new HttpsError("failed-precondition", "You are not part of an organization.");
  const { registerPushToken } = await import("./notifications");
  await registerPushToken(request.auth.uid, token, user.enterprise_id, request.rawRequest.headers["user-agent"]);
  return { ok: true };
});

export const unregisterPushToken = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const token = String(request.data?.token ?? "").trim();
  if (!token) return { ok: true };
  const { unregisterPushToken } = await import("./notifications");
  await unregisterPushToken(request.auth.uid, token);
  return { ok: true };
});

/** Disconnect an integration and purge all data it produced (analytics, messages, sites). */
export const disconnectIntegration = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const enterpriseId = request.data?.enterpriseId as string | undefined;
  const type = request.data?.type as string | undefined;
  if (!enterpriseId || !type) throw new HttpsError("invalid-argument", "Missing enterpriseId or type.");
  await requireOrgManager(request.auth.uid, enterpriseId);
  const { disconnectIntegration: run } = await import("./disconnect");
  return run(enterpriseId, type);
});

export const disconnectPersonalIntegration = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const type = request.data?.type as string | undefined;
  const userSnap = await (await import("./admin")).db.doc(`users/${request.auth.uid}`).get();
  const enterpriseId = userSnap.data()?.enterprise_id as string | undefined;
  if (!enterpriseId || !type) throw new HttpsError("invalid-argument", "Missing organization or integration type.");
  const { disconnectPersonalIntegration: run } = await import("./disconnect");
  return run(enterpriseId, type, request.auth.uid);
});

// ---- Attendance & field work ----
export const attendanceStatus = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  return (await import("./attendance")).getAttendanceStatus(request.auth.uid);
});

export const attendanceAction = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  return (await import("./attendance")).recordAttendanceAction(request.auth.uid, request.data ?? {});
});

export const updateAttendanceSettings = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  return (await import("./attendance")).saveAttendanceSettings(request.auth.uid, request.data ?? {});
});

export const attendanceDashboard = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  return (await import("./attendance")).getAttendanceDashboard(request.auth.uid, request.data ?? {});
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
