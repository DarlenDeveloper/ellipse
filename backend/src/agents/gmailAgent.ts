import * as logger from "firebase-functions/logger";
import { db, FieldValue } from "../admin";
import { callGemini } from "../gemini";
import { executeAgentAction } from "../executeAgentAction";
import { enrichFromZoho, ZohoEnrichment } from "../connections/zoho";
import { loadKnowledgeBase } from "./knowledge";

/**
 * The Gmail agent.
 *
 * Reads a Gmail conversation, optionally enriches with CRM context (if the
 * sender is known in Zoho), and drafts a reply. The reply goes through the gate
 * as a `send_reply` action against target `gmail`:
 *   - Supervised → queued in pending_actions (the suggested response), approve to send
 *   - Unsupervised → sent immediately
 *
 * The agent never sends directly — only through executeAgentAction.
 */

const TOOLS = [
  {
    name: "send_reply",
    description:
      "Draft a reply to the customer in this email thread. Only call this when a response is warranted. Write the full reply body as it should be sent.",
    parameters: {
      type: "object",
      properties: {
        body: { type: "string", description: "The full reply text to send to the customer." },
      },
      required: ["body"],
    },
  },
];

function renderContext(e: ZohoEnrichment): string {
  if (!e.found || !e.record) return "The sender is not a known CRM contact.";
  const deals = e.deals.length
    ? e.deals.map((d) => `${d.name} (stage: ${d.stage})`).join(", ")
    : "no open deals";
  return `Sender is a known ${e.type} in Zoho: ${e.record.name}${
    e.record.account ? ` at ${e.record.account}` : ""
  }. Deals: ${deals}.`;
}

function buildSystem(orgName: string): string {
  return `You are the Gmail agent for ${orgName}, acting inside Ellipse, a business automation platform.
You read a customer email thread and draft a professional reply on ${orgName}'s behalf.
- Match a professional, helpful email tone.
- Use any CRM context and company knowledge base provided to personalize the reply.
- Only call send_reply when the latest message actually needs a response (a question, request, or follow-up). If no reply is needed, respond with plain text explaining why and do not call the tool.
- Keep replies concise and specific. Do not invent facts, prices, or commitments you weren't given.
- ALWAYS sign off as "The ${orgName} Team". NEVER use placeholders like [Your Name] or [Company Name].`;
}

export type GmailAgentResult = {
  draft: string;
  context: ZohoEnrichment;
  action: { actionType: string; result: unknown } | null;
  usageTokens: number;
};

export async function runGmailAgent(
  enterpriseId: string,
  conversationId: string
): Promise<GmailAgentResult> {
  const convSnap = await db.doc(`conversations/${conversationId}`).get();
  if (!convSnap.exists) throw new Error("conversation_not_found");
  const conv = convSnap.data() as {
    customer_ref?: string;
    subject?: string;
    thread_id?: string;
  };

  // Org name for the signature.
  const entSnap = await db.doc(`enterprises/${enterpriseId}`).get();
  const orgName = (entSnap.data()?.name as string) || "our team";

  const msgsSnap = await db
    .collection("messages")
    .where("conversation_id", "==", conversationId)
    .get();
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

  const email = (conv.customer_ref ?? "").toLowerCase();

  // Cross-agent context: pull CRM info if this sender exists in Zoho.
  let context: ZohoEnrichment = { found: false, type: null, record: null, deals: [] };
  try {
    context = await enrichFromZoho(enterpriseId, email);
  } catch {
    // Zoho may not be connected — proceed without CRM context.
  }

  const knowledge = await loadKnowledgeBase(enterpriseId);

  const transcript = messages
    .map((m) => `[${m.sender_type ?? "unknown"}] ${(m.body || m.snippet || "").slice(0, 1500)}`)
    .join("\n\n");

  const prompt = [
    `Subject: ${conv.subject ?? "(none)"}`,
    `Customer email: ${email || "(unknown)"}`,
    ``,
    knowledge ? `--- Company knowledge base (use these facts; don't contradict them) ---\n${knowledge}\n` : "",
    `--- CRM context ---`,
    renderContext(context),
    ``,
    `--- Thread (oldest first) ---`,
    transcript,
    ``,
    `Draft a reply if one is warranted.`,
  ]
    .filter(Boolean)
    .join("\n");

  const gemini = await callGemini({ system: buildSystem(orgName), prompt, tools: TOOLS });

  let action: GmailAgentResult["action"] = null;
  const call = gemini.functionCalls.find((c) => c.name === "send_reply");
  if (call) {
    const body = (call.args.body as string) ?? "";
    const result = await executeAgentAction({
      enterpriseId,
      agentId: "gmail-agent",
      domain: "inbox",
      actionType: "send_reply",
      // Threading/recipient/subject come from the conversation, body from the agent.
      params: {
        threadId: conv.thread_id ?? conversationId.split("_").slice(1).join("_"),
        to: email,
        subject: conv.subject ?? "",
        body,
      },
      targetSystem: "gmail",
      reasoning: gemini.text || "Suggested reply to the customer.",
    });
    action = { actionType: "send_reply", result };
  }

  await db.doc(`conversations/${conversationId}`).set(
    {
      last_agent: "gmail-agent",
      last_agent_reply: gemini.functionCalls.find((c) => c.name === "send_reply")?.args.body ?? gemini.text,
      last_agent_run_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  logger.info("Gmail agent run", {
    enterpriseId,
    conversationId,
    drafted: !!action,
    tokens: gemini.usageTokens,
  });

  return {
    draft: (call?.args.body as string) ?? gemini.text,
    context,
    action,
    usageTokens: gemini.usageTokens,
  };
}
