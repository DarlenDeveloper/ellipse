import { draftAndRoute, ReplyAgentResult } from "./replyBase";

/** SMTP agent — handles SMTP/IMAP conversations only. */
export function runSmtpAgent(enterpriseId: string, conversationId: string): Promise<ReplyAgentResult> {
  return draftAndRoute(enterpriseId, conversationId, {
    agentId: "smtp-agent",
    agentLabel: "SMTP",
    targetSystem: "smtp",
    tone: "email",
  });
}
