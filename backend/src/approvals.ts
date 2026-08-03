import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { db, FieldValue } from "./admin";
import { executeAction } from "./executeAgentAction";
import { notificationRecipients, notifyUsers } from "./notifications";
import { grantedTypesFor } from "./access";

const zohoClientId = defineSecret("ZOHO_CLIENT_ID");
const zohoClientSecret = defineSecret("ZOHO_CLIENT_SECRET");
const googleClientId = defineSecret("GOOGLE_OAUTH_CLIENT_ID");
const googleClientSecret = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET");
const msClientId = defineSecret("MS_CLIENT_ID");
const msClientSecret = defineSecret("MS_CLIENT_SECRET");
const PAGE_SIZE = 12;
type Role = "owner" | "admin" | "employee";
const TARGET_TO_TYPE: Record<string, string> = { gmail: "google-workspace" };

function connectionType(agentId?: string, targetSystem?: string) {
  const raw = ((agentId?.startsWith("human-") ? targetSystem : agentId?.replace(/-agent$/, "")) || targetSystem || "").toLowerCase();
  return TARGET_TO_TYPE[raw] ?? raw;
}

async function approvalAccess(uid: string) {
  const user = (await db.doc(`users/${uid}`).get()).data();
  const enterpriseId = user?.enterprise_id as string | undefined;
  if (!enterpriseId) throw new HttpsError("failed-precondition", "You are not part of an organization.");
  const role = (user?.role as Role | undefined) ?? "employee";
  const isManager = role === "owner" || role === "admin";
  const grants = await grantedTypesFor(enterpriseId, uid, role);
  return { enterpriseId, isManager, allowed: grants === "all" ? new Set<string>() : grants };
}

export async function listApprovals(uid: string, args: { filter?: string; cursor?: { createdAt?: number; id?: string } | null }) {
  const { enterpriseId, isManager, allowed } = await approvalAccess(uid);
  const requestedFilter = String(args.filter ?? "all").toLowerCase();
  const filter = ["all", "pending", "approved", "executed", "rejected"].includes(requestedFilter) ? requestedFilter : "all";
  let q: FirebaseFirestore.Query = db.collection("pending_actions").where("enterprise_id", "==", enterpriseId);
  if (filter === "approved") q = q.where("status", "in", ["approved", "executed"]);
  else if (filter !== "all") q = q.where("status", "==", filter);
  q = q.orderBy("created_at", "desc").orderBy(FieldPath.documentId(), "desc");
  const cursorMs = Number(args.cursor?.createdAt);
  const cursorId = String(args.cursor?.id ?? "");
  if (cursorMs > 0 && cursorId) q = q.startAfter(Timestamp.fromMillis(cursorMs), cursorId);

  const visible: Record<string, any>[] = [];
  let scanQuery = q;
  let exhausted = false;
  let lastScanned: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  while (visible.length < PAGE_SIZE + 1 && !exhausted) {
    const snapshot = await scanQuery.limit(36).get();
    exhausted = snapshot.size < 36;
    for (const item of snapshot.docs) {
      lastScanned = item;
      const action = item.data();
      const params = (action.params ?? {}) as Record<string, unknown>;
      const ownerUid = String(params.connectionOwnerUid ?? action.owner_uid ?? "");
      const canSee = isManager || (ownerUid ? ownerUid === uid : allowed.has(connectionType(action.agent_id, action.target_system)));
      if (!canSee) continue;
      visible.push({ id: item.id, ...action });
      if (visible.length >= PAGE_SIZE + 1) break;
    }
    if (!exhausted && visible.length < PAGE_SIZE + 1 && lastScanned) scanQuery = q.startAfter(lastScanned.get("created_at"), lastScanned.id);
  }
  const hasNext = visible.length > PAGE_SIZE;
  const page = visible.slice(0, PAGE_SIZE).map((action): Record<string, any> => ({
    ...action,
    created_at: (action.created_at as Timestamp | undefined)?.toMillis() ?? null,
    decided_at: (action.decided_at as Timestamp | undefined)?.toMillis() ?? null,
    updated_at: (action.updated_at as Timestamp | undefined)?.toMillis() ?? null,
    executed_at: (action.executed_at as Timestamp | undefined)?.toMillis() ?? null,
  }));
  const last = page[page.length - 1];
  const pendingTotal = isManager
    ? (await db.collection("pending_actions").where("enterprise_id", "==", enterpriseId).where("status", "==", "pending").count().get()).data().count
    : null;
  return { items: page, hasNext, nextCursor: hasNext && last ? { createdAt: last.created_at, id: last.id } : null, pendingTotal };
}

export async function rejectAllPending(uid: string) {
  const { enterpriseId, isManager } = await approvalAccess(uid);
  if (!isManager) throw new HttpsError("permission-denied", "Only an owner or admin can reject all pending actions.");
  let rejected = 0;
  while (true) {
    const snapshot = await db.collection("pending_actions").where("enterprise_id", "==", enterpriseId).where("status", "==", "pending").limit(400).get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach((item) => batch.update(item.ref, { status: "rejected", decided_at: FieldValue.serverTimestamp(), decided_by_uid: uid, bulk_rejected: true }));
    await batch.commit();
    rejected += snapshot.size;
  }
  if (rejected) {
    const recipients = await notificationRecipients(enterpriseId, "approvers");
    await notifyUsers({ enterpriseId, recipientUids: recipients, kind: "action_failed", title: "Pending actions rejected", body: `${rejected} pending agent action${rejected === 1 ? " was" : "s were"} rejected in bulk.`, href: "/approvals" });
  }
  return { ok: true, rejected };
}

/**
 * Executes a pending action once a human approves it (Supervised mode).
 *
 * Fires on any pending_actions update; acts only on the pending → approved
 * transition. Runs the real side effect through the shared executeAction() and
 * writes back status + external_ref. Setting status to "executed"/"error" here
 * does not re-trigger the approved branch, so there's no loop.
 */
export const onPendingActionApproved = onDocumentUpdated(
  {
    document: "pending_actions/{id}",
    secrets: [zohoClientId, zohoClientSecret, googleClientId, googleClientSecret, msClientId, msClientSecret],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Only handle a human decision made against a pending action.
    if (before.status !== "pending" || (after.status !== "approved" && after.status !== "rejected")) return;

    if (after.status === "rejected") {
      if (after.bulk_rejected) return;
      const recipients = await notificationRecipients(after.enterprise_id, "approvers");
      await notifyUsers({
        enterpriseId: after.enterprise_id,
        recipientUids: recipients,
        kind: "action_failed",
        title: "Agent action was declined",
        body: after.action_summary || `${after.action_type.replace(/_/g, " ")} was not approved.`,
        href: "/approvals",
        entityId: event.params.id,
      });
      return;
    }

    const ref = event.data!.after.ref;
    try {
      const externalRef = await executeAction(
        after.enterprise_id,
        after.target_system,
        after.action_type,
        (after.params as Record<string, unknown>) ?? {}
      );
      const params = (after.params as Record<string, unknown>) ?? {};
      if (after.action_type === "send_reply" && params.humanInitiated && params.conversationId) {
        const conversationId = String(params.conversationId);
        const convRef = db.doc(`conversations/${conversationId}`);
        const conv = (await convRef.get()).data();
        await db.collection("messages").add({
          conversation_id: conversationId,
          enterprise_id: after.enterprise_id,
          channel: conv?.channel ?? after.target_system,
          sender_type: "us",
          from: "You",
          from_email: "",
          subject: params.subject ?? conv?.subject ?? "",
          body: params.body ?? "",
          snippet: String(params.body ?? "").slice(0, 200),
          cc: params.cc ?? null,
          attachment: params.attachment ?? null,
          timestamp: new Date(),
          created_at: FieldValue.serverTimestamp(),
          connection_scope: params.connectionScope ?? "org",
          owner_uid: params.ownerUid ?? null,
        });
        await convRef.set({ last_message_at: new Date(), updated_at: FieldValue.serverTimestamp() }, { merge: true });
      }
      await ref.update({
        status: "executed",
        external_ref: externalRef,
        executed_at: FieldValue.serverTimestamp(),
      });
      const recipients = await notificationRecipients(after.enterprise_id, "approvers");
      await notifyUsers({
        enterpriseId: after.enterprise_id,
        recipientUids: recipients,
        kind: "action_completed",
        title: "Approved action completed",
        body: after.action_summary || `${after.action_type.replace(/_/g, " ")} completed successfully.`,
        href: "/approvals",
        entityId: event.params.id,
      });
      logger.info("Approved action executed", { id: event.params.id, externalRef });
    } catch (e) {
      await ref.update({
        status: "error",
        error: (e as Error).message,
        executed_at: FieldValue.serverTimestamp(),
      });
      const recipients = await notificationRecipients(after.enterprise_id, "approvers");
      await notifyUsers({
        enterpriseId: after.enterprise_id,
        recipientUids: recipients,
        kind: "action_failed",
        title: "Approved action failed",
        body: (e as Error).message || "The approved action could not be completed.",
        href: "/approvals",
        entityId: event.params.id,
      });
      logger.error("Approved action failed", { id: event.params.id, error: (e as Error).message });
    }
  }
);
