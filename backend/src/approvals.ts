import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { db, FieldValue } from "./admin";
import { executeAction } from "./executeAgentAction";

const zohoClientId = defineSecret("ZOHO_CLIENT_ID");
const zohoClientSecret = defineSecret("ZOHO_CLIENT_SECRET");
const googleClientId = defineSecret("GOOGLE_OAUTH_CLIENT_ID");
const googleClientSecret = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET");
const msClientId = defineSecret("MS_CLIENT_ID");
const msClientSecret = defineSecret("MS_CLIENT_SECRET");

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

    // Only handle the approval transition.
    if (before.status !== "pending" || after.status !== "approved") return;

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
      logger.info("Approved action executed", { id: event.params.id, externalRef });
    } catch (e) {
      await ref.update({
        status: "error",
        error: (e as Error).message,
        executed_at: FieldValue.serverTimestamp(),
      });
      logger.error("Approved action failed", { id: event.params.id, error: (e as Error).message });
    }
  }
);
