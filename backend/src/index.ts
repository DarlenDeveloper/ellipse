import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import "./admin";
import { executeAgentAction } from "./executeAgentAction";
import { ExecuteAgentActionInput } from "./types";

setGlobalOptions({ region: "us-central1", maxInstances: 10 });

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

export { executeAgentAction };
