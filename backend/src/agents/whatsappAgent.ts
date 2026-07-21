import { draftAndRoute, ReplyAgentResult } from "./replyBase";

/** WhatsApp agent — handles WhatsApp conversations only (casual chat tone). */
export function runWhatsappAgent(enterpriseId: string, conversationId: string): Promise<ReplyAgentResult> {
  return draftAndRoute(enterpriseId, conversationId, {
    agentId: "whatsapp-agent",
    agentLabel: "WhatsApp",
    targetSystem: "whatsapp",
    tone: "chat",
  });
}
