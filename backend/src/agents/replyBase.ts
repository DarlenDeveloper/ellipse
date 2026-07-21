import * as logger from "firebase-functions/logger";
import { db, FieldValue } from "../admin";
import { callGemini } from "../gemini";
import { executeAgentAction } from "../executeAgentAction";
import { enrichFromZoho, ZohoEnrichment } from "../connections/zoho";
import { loadKnowledgeBase } from "./knowledge";
import { TargetSystem } from "../types";

/**
 * Shared reply-drafting core used by the per-connection messaging agents
 * (Gmail, SMTP, Outlook, WhatsApp). Each connection has its OWN agent that
 * fixes its channel/target/tone and calls this — the logic lives once, but no
 * single agent spans multiple connections.
 */

const TOOLS = [
  {
    name: "send_reply",
    description:
      "Draft a reply to the customer. Only call this when a response is warranted. Write the full reply body as it should be sent.",
    parameters: {
      type: "object",
      properties: {
        body: { type: "string", description: "The full reply text to send to the customer." },
      },
      required: ["body"],
    },
  },
];

export type ReplyAgentConfig = {
  agentId: string; // e.g. "gmail-agent"
  agentLabel: string; // e.g. "Gmail"
  targetSystem: TargetSystem; // where send_reply routes
  tone: "email" | "chat";
};

export type ReplyAgentResult = {
  draft: string;
  context: ZohoEnrichment;
  action: { actionType: string; result: unknown } | null;
  usageTokens: number;
};

function renderContext(e: ZohoEnrichment): string {
  if (!e.found || !e.record) return "The sender is not a known CRM contact.";
  const deals = e.deals.length
    ? e.deals.map((d) => `${d.name} (stage: ${d.stage})`).join(", ")
    : "no open deals";
  return `Sender is a known ${e.type} in Zoho: ${e.record.name}${
    e.record.account ? ` at ${e.record.account}` : ""
  }. Deals: ${deals}.`;
}

function buildSystem(orgName: string, cfg: ReplyAgentConfig): string {
  const toneLine =
    cfg.tone === "chat"
      ? `- This is a chat channel: keep the reply short, friendly, and conversational. No email formalities, no subject line. A brief sign-off like "— ${orgName}" is fine but keep it light.`
      : `- Match a professional, helpful email tone.
- ALWAYS sign off as "The ${orgName} Team". NEVER use placeholders like [Your Name] or [Company Name].`;
  return `You are the ${cfg.agentLabel} agent for ${orgName}, acting inside Ellipse, a business automation platform.
You read a customer conversation and draft a reply on ${orgName}'s behalf.
${toneLine}
- Use any CRM context and company knowledge base provided to personalize the reply.
- Only call send_reply when a REAL person is asking something this business would answer, relevant to what it does.
- NEVER reply to automated, transactional, notification, security-alert, receipt, newsletter, or marketing emails. If it's not a genuine human message needing a response, respond with plain text saying so and do NOT call the tool.
- Keep replies concise and specific. Do not invent facts, prices, or commitments you weren't given.`;
}

export async function draftAndRoute(
  enterpriseId: string,
  conversationId: string,
  cfg: ReplyAgentConfig
): Promise<ReplyAgentResult> {
  const convSnap = await db.doc(`conversations/${conversationId}`).get();
  if (!convSnap.exists) throw new Error("conversation_not_found");
  const conv = convSnap.data() as {
    customer_ref?: string;
    subject?: string;
    thread_id?: string;
    channel?: string;
  };

  const entSnap = await db.doc(`enterprises/${enterpriseId}`).get();
  const orgName = (entSnap.data()?.name as string) || "our team";

  const msgsSnap = await db.collection("messages").where("conversation_id", "==", conversationId).get();
  const messages = msgsSnap.docs
    .map(
      (d) =>
        d.data() as {
          sender_type?: string;
          from?: string;
          body?: string;
          snippet?: string;
          timestamp?: FirebaseFirestore.Timestamp;
        }
    )
    .sort((a, b) => (a.timestamp?.toMillis() ?? 0) - (b.timestamp?.toMillis() ?? 0))
    .slice(-10);

  const ref = (conv.customer_ref ?? "").toLowerCase();

  let context: ZohoEnrichment = { found: false, type: null, record: null, deals: [] };
  try {
    context = await enrichFromZoho(enterpriseId, ref);
  } catch {
    // Zoho may not be connected — proceed without CRM context.
  }

  const knowledge = await loadKnowledgeBase(enterpriseId);

  const transcript = messages
    .map((m) => `[${m.sender_type ?? "unknown"}] ${(m.body || m.snippet || "").slice(0, 1500)}`)
    .join("\n\n");

  const prompt = [
    `Subject: ${conv.subject ?? "(none)"}`,
    `Customer: ${ref || "(unknown)"}`,
    ``,
    knowledge ? `--- Company knowledge base (use these facts; don't contradict them) ---\n${knowledge}\n` : "",
    `--- CRM context ---`,
    renderContext(context),
    ``,
    `--- Conversation (oldest first) ---`,
    transcript,
    ``,
    `Draft a reply if one is warranted.`,
  ]
    .filter(Boolean)
    .join("\n");

  const gemini = await callGemini({ system: buildSystem(orgName, cfg), prompt, tools: TOOLS });

  let action: ReplyAgentResult["action"] = null;
  const call = gemini.functionCalls.find((c) => c.name === "send_reply");
  if (call) {
    const body = (call.args.body as string) ?? "";
    const result = await executeAgentAction({
      enterpriseId,
      agentId: cfg.agentId,
      domain: "inbox",
      actionType: "send_reply",
      params: {
        conversationId,
        threadId: conv.thread_id ?? conversationId.split("_").slice(1).join("_"),
        to: ref,
        subject: conv.subject ?? "",
        body,
      },
      targetSystem: cfg.targetSystem,
      reasoning: gemini.text || "Suggested reply to the customer.",
    });
    action = { actionType: "send_reply", result };
  }

  await db.doc(`conversations/${conversationId}`).set(
    {
      last_agent: cfg.agentId,
      last_agent_reply: call?.args.body ?? gemini.text,
      last_agent_run_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  logger.info(`${cfg.agentLabel} agent run`, {
    enterpriseId,
    conversationId,
    drafted: !!action,
    tokens: gemini.usageTokens,
  });

  return { draft: (call?.args.body as string) ?? gemini.text, context, action, usageTokens: gemini.usageTokens };
}
