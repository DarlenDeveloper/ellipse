import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "./admin";
import { executeAction } from "./executeAgentAction";

const zohoClientId = defineSecret("ZOHO_CLIENT_ID");
const zohoClientSecret = defineSecret("ZOHO_CLIENT_SECRET");

/**
 * Executes a pending action once a human approves it (Supervised mode).
 *
 * Fires on any pending_actions update; acts only on the pending → approved
 * transition. Runs the real side effect through the shared executeAction() and
 * writes back status + external_ref. Setting status to "executed"/"error" here
 * does not re-trigger the approved branch, so there's no loop.
 */
export const onPendingActionApproved = onDocumentUpdated(
  { document: "pending_actions/{id}", secrets: [zohoClientId, zohoClientSecret] },
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
