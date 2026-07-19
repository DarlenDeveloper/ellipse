import * as logger from "firebase-functions/logger";
import { db, FieldValue } from "../admin";
import { callGemini } from "../gemini";
import { executeAgentAction } from "../executeAgentAction";
import { enrichFromZoho, ZohoEnrichment } from "../connections/zoho";

/**
 * The Zoho CRM agent.
 *
 * For a given conversation it:
 *   1. reads recent messages,
 *   2. enriches from Zoho (who is this contact + their deals),
 *   3. asks Gemini for a reply + any CRM updates (as function calls),
 *   4. routes every proposed CRM write through executeAgentAction (the gate),
 *      so mode (off/supervised/unsupervised) decides suggest-vs-execute.
 *
 * The agent never writes to Zoho directly — only through the gate.
 */

// CRM tools the agent may call. Shapes mirror the gate's Zoho executors 1:1.
const TOOLS = [
  {
    name: "create_record",
    description:
      "Create a new record in Zoho CRM. Use when an inbound contact is not yet in the CRM (create a Lead) or a new Contact is warranted.",
    parameters: {
      type: "object",
      properties: {
        module: { type: "string", enum: ["Leads", "Contacts"], description: "Target module." },
        fields: {
          type: "object",
          description: "Field values, e.g. Last_Name, First_Name, Email, Company.",
        },
      },
      required: ["module", "fields"],
    },
  },
  {
    name: "update_record",
    description:
      "Update an existing Zoho CRM record by id. Use for things like moving a Deal to a new Stage.",
    parameters: {
      type: "object",
      properties: {
        module: { type: "string", description: "Module of the record, e.g. Deals, Contacts." },
        recordId: { type: "string", description: "Id of the record to update." },
        fields: { type: "object", description: "Fields to change, e.g. { Stage: 'Closed Won' }." },
      },
      required: ["module", "recordId", "fields"],
    },
  },
  {
    name: "add_note",
    description: "Attach a note to a Zoho record, recording what happened in this conversation.",
    parameters: {
      type: "object",
      properties: {
        module: { type: "string", description: "Module of the record, e.g. Contacts, Deals." },
        recordId: { type: "string", description: "Id of the record to annotate." },
        content: { type: "string", description: "The note body." },
      },
      required: ["module", "recordId", "content"],
    },
  },
];

function renderContext(e: ZohoEnrichment): string {
  if (!e.found || !e.record) {
    return "This sender is NOT in Zoho CRM yet. Consider creating a Lead if they look like a prospect.";
  }
  const deals = e.deals.length
    ? e.deals.map((d) => `  - ${d.name} — stage: ${d.stage}${d.amount ? `, amount: ${d.amount}` : ""} (id: ${d.id})`).join("\n")
    : "  (no open deals)";
  return [
    `Known ${e.type} in Zoho:`,
    `  name: ${e.record.name}`,
    `  email: ${e.record.email}`,
    e.record.account ? `  account: ${e.record.account}` : "",
    `  record id: ${e.record.id}`,
    `Deals:`,
    deals,
  ]
    .filter(Boolean)
    .join("\n");
}

const SYSTEM = `You are the Zoho CRM agent inside Ellipse, a business automation platform.
You read a customer conversation, keep the CRM accurate, and help move deals forward.
- Use the provided Zoho context. Do NOT invent record ids — only use ids given to you.
- When creating a Lead/Contact, use the REAL sender email and name given in the Sender block.
  Never use placeholders like "n/a" or "N/A". Zoho requires Last_Name — if no surname is known,
  use the name before the @ in the email as Last_Name. Only set Company if the customer states one.
- Propose CRM changes ONLY when the conversation clearly warrants them (new prospect, deal stage change, noteworthy update).
- Prefer add_note to capture context over guessing field changes.
- Write a short, professional reply to the customer in your text response.
- Keep reasoning concise; it is stored as the action summary shown for approval.`;

export type ZohoAgentResult = {
  reply: string;
  context: ZohoEnrichment;
  actions: { actionType: string; params: Record<string, unknown>; result: unknown }[];
  usageTokens: number;
};

export async function runZohoAgent(
  enterpriseId: string,
  conversationId: string
): Promise<ZohoAgentResult> {
  // 1. Load conversation + recent messages
  const convSnap = await db.doc(`conversations/${conversationId}`).get();
  if (!convSnap.exists) throw new Error("conversation_not_found");
  const conv = convSnap.data() as { customer_ref?: string; subject?: string };

  // No orderBy here — avoids needing a composite index; sort in memory instead.
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

  // Derive the sender's display name from the latest customer message's From header
  // (e.g. "Jane Doe <jane@acme.com>" → "Jane Doe").
  const lastCustomer = [...messages].reverse().find((m) => m.sender_type === "customer");
  const rawFrom = lastCustomer?.from ?? "";
  const senderName = (rawFrom.match(/^\s*"?([^"<]+?)"?\s*</)?.[1] ?? "").trim();

  // 2. Enrich from Zoho
  const context = await enrichFromZoho(enterpriseId, email);

  // 3. Build the prompt
  const transcript = messages
    .map((m) => `[${m.sender_type ?? "unknown"}] ${(m.body || m.snippet || "").slice(0, 1500)}`)
    .join("\n\n");

  const prompt = [
    `Subject: ${conv.subject ?? "(none)"}`,
    ``,
    `--- Sender (use these exact values for any Lead/Contact you create) ---`,
    `email: ${email || "(unknown)"}`,
    `name: ${senderName || "(not provided — infer from signature, else leave blank)"}`,
    ``,
    `--- Zoho context ---`,
    renderContext(context),
    ``,
    `--- Conversation (oldest first) ---`,
    transcript,
    ``,
    `Decide the reply and any CRM updates.`,
  ].join("\n");

  const gemini = await callGemini({ system: SYSTEM, prompt, tools: TOOLS });

  // 4. Route each proposed CRM write through the gate
  const actions: ZohoAgentResult["actions"] = [];
  for (const call of gemini.functionCalls) {
    const result = await executeAgentAction({
      enterpriseId,
      agentId: "zoho-agent",
      domain: "inbox",
      actionType: call.name,
      params: call.args,
      targetSystem: "zoho",
      reasoning: gemini.text || `Zoho agent: ${call.name}`,
    });
    actions.push({ actionType: call.name, params: call.args, result });
  }

  // 5. Persist the agent's output on the conversation for the inbox UI
  await db.doc(`conversations/${conversationId}`).set(
    {
      last_agent: "zoho-agent",
      last_agent_reply: gemini.text,
      last_agent_actions: actions.map((a) => ({ actionType: a.actionType, result: a.result })),
      last_agent_run_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  logger.info("Zoho agent run", {
    enterpriseId,
    conversationId,
    found: context.found,
    actions: actions.length,
    tokens: gemini.usageTokens,
  });

  return { reply: gemini.text, context, actions, usageTokens: gemini.usageTokens };
}
