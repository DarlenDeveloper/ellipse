import { draftAndRoute, ReplyAgentResult } from "./replyBase";

/**
 * Microsoft 365 agent — owns all MS365 capabilities for the connection.
 * Today: Outlook email replies. Later: Word + Excel document creation.
 */
export function runMicrosoftAgent(enterpriseId: string, conversationId: string): Promise<ReplyAgentResult> {
  return draftAndRoute(enterpriseId, conversationId, {
    agentId: "microsoft365-agent",
    agentLabel: "Microsoft 365",
    targetSystem: "microsoft365",
    tone: "email",
  });
}
