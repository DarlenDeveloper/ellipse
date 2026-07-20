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
  { secrets: [geminiKey, googleClientId, googleClientSecret, zohoClientId, zohoClientSecret] },
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
  { secrets: [geminiKey, googleClientId, googleClientSecret, zohoClientId, zohoClientSecret] },
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
      const { runGmailAgent: run } = await import("./agents/gmailAgent");
      const result = await run(enterpriseId, conversationId);
      res.json({ ok: true, conversationId, ...result });
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

export { executeAgentAction };
export { onPendingActionApproved } from "./approvals";
export { onMessageCreated } from "./onMessage";
