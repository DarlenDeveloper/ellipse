import * as logger from "firebase-functions/logger";
import { db, FieldValue } from "./admin";
import {
  ExecuteAgentActionInput,
  ExecuteAgentActionResult,
  Mode,
  Tier,
  tierFeatures,
} from "./types";

/**
 * The single choke point for every agent action.
 *
 * No agent, connection, or feature implements its own approval logic — they all
 * route through here. This function is mode-aware, tier-aware, and wallet-aware.
 *
 * Flow:
 *   1. Load enterprise (mode, tier, wallet)
 *   2. Feature gate by tier (e.g. Starter has no Inbox/Connections)
 *   3. Wallet check — if empty, auto-downgrade to Off and stop
 *   4. Mode branch:
 *        off          → log analytics only, no execution
 *        supervised   → write pending_actions (status: pending), notify (later)
 *        unsupervised → execute immediately, debit wallet, write executed
 */
export async function executeAgentAction(
  input: ExecuteAgentActionInput
): Promise<ExecuteAgentActionResult> {
  const { enterpriseId, agentId, domain, actionType, params, targetSystem, reasoning } = input;

  // 1. Load enterprise
  const entRef = db.doc(`enterprises/${enterpriseId}`);
  const entSnap = await entRef.get();
  if (!entSnap.exists) {
    return { status: "error", reason: "enterprise_not_found" };
  }
  const ent = entSnap.data() as {
    mode?: Mode;
    subscription_tier?: Tier;
    wallet_id?: string;
  };

  const mode: Mode = ent.mode ?? "supervised";
  const tier: Tier = ent.subscription_tier ?? "starter";

  // 2. Feature gate by tier
  const features = tierFeatures[tier];
  if (domain === "inbox" && !features.inbox) {
    return { status: "blocked", reason: "inbox_not_available_on_tier" };
  }
  if (targetSystem !== "internal" && !features.connections) {
    return { status: "blocked", reason: "connections_not_available_on_tier" };
  }

  // 3. Off mode — collect only, never run agents / debit
  if (mode === "off") {
    await db.collection("analytics_events").add({
      source: "agent_action_suppressed",
      workspace_id: enterpriseId,
      payload: { agentId, domain, actionType, targetSystem },
      timestamp: FieldValue.serverTimestamp(),
    });
    return { status: "off" };
  }

  // Subscription check — the wallet tracks the subscription window (no credits).
  // If the subscription has expired, freeze: no agent actions run.
  if (ent.wallet_id) {
    const walletSnap = await db.doc(`wallets/${ent.wallet_id}`).get();
    const w = walletSnap.data() as { subscription_end?: FirebaseFirestore.Timestamp; status?: string } | undefined;
    const end = w?.subscription_end;
    const expired = w?.status === "frozen" || (end ? end.toDate().getTime() < Date.now() : false);

    if (expired) {
      if (w?.status !== "frozen") {
        await db.doc(`wallets/${ent.wallet_id}`).update({ status: "frozen", updated_at: FieldValue.serverTimestamp() });
      }
      await db.collection("analytics_events").add({
        source: "subscription_expired",
        workspace_id: enterpriseId,
        payload: { enterpriseId },
        timestamp: FieldValue.serverTimestamp(),
      });
      // TODO: notify owner/admin to renew
      return { status: "frozen", reason: "subscription_expired" };
    }
  }

  // 4a. Supervised — queue for human approval
  if (mode === "supervised") {
    const ref = await db.collection("pending_actions").add({
      enterprise_id: enterpriseId,
      agent_id: agentId,
      domain,
      action_type: actionType,
      params,
      target_system: targetSystem,
      status: "pending",
      action_summary: reasoning,
      external_ref: null,
      created_at: FieldValue.serverTimestamp(),
    });
    // TODO: send push notification to mobile app
    logger.info("Queued pending action", { enterpriseId, pendingActionId: ref.id });
    return { status: "pending", pendingActionId: ref.id };
  }

  // 4b. Unsupervised — execute immediately
  const externalRef = await executeAction(enterpriseId, targetSystem, actionType, params);
  const ref = await db.collection("pending_actions").add({
    enterprise_id: enterpriseId,
    agent_id: agentId,
    domain,
    action_type: actionType,
    params,
    target_system: targetSystem,
    status: "executed",
    action_summary: reasoning,
    external_ref: externalRef,
    created_at: FieldValue.serverTimestamp(),
  });
  logger.info("Executed action", { enterpriseId, pendingActionId: ref.id, externalRef });
  return { status: "executed", pendingActionId: ref.id, externalRef: externalRef ?? undefined };
}

/**
 * Performs the actual side effect against the target system.
 * Internal actions (reminders, calendar) will be implemented directly;
 * connection actions (Zoho/Odoo/...) will call the registered connection tools.
 *
 * Stubbed for now — returns a placeholder external reference.
 */
async function executeAction(
  enterpriseId: string,
  targetSystem: string,
  actionType: string,
  params: Record<string, unknown>
): Promise<string | null> {
  if (targetSystem === "zoho") {
    return executeZohoAction(enterpriseId, actionType, params);
  }
  // TODO: internal handlers + other connections (odoo, whatsapp, ...)
  logger.info("executeAction (stub)", { targetSystem, actionType });
  return `${targetSystem}:stub:${Date.now()}`;
}

/**
 * Routes a Zoho action to the connection's executors. actionType names the
 * operation; params carry the module/record/fields the agent chose.
 */
async function executeZohoAction(
  enterpriseId: string,
  actionType: string,
  params: Record<string, unknown>
): Promise<string | null> {
  const zoho = await import("./connections/zoho");
  const module = (params.module as string) ?? "Leads";

  switch (actionType) {
    case "create_record":
      return zoho.createRecord(enterpriseId, module, (params.fields as Record<string, unknown>) ?? {});
    case "update_record":
      return zoho.updateRecord(
        enterpriseId,
        module,
        params.recordId as string,
        (params.fields as Record<string, unknown>) ?? {}
      );
    case "add_note":
      return zoho.addNote(enterpriseId, module, params.recordId as string, params.content as string);
    default:
      logger.warn("Unknown Zoho action", { actionType });
      return null;
  }
}
