import { draftAndRoute, ReplyAgentResult } from "./replyBase";

/** Gmail agent — handles Gmail conversations only. */
export function runGmailAgent(enterpriseId: string, conversationId: string): Promise<ReplyAgentResult> {
  return draftAndRoute(enterpriseId, conversationId, {
    agentId: "gmail-agent",
    agentLabel: "Gmail",
    targetSystem: "gmail",
    tone: "email",
  });
}
