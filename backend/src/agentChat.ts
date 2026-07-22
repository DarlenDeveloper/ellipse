import * as logger from "firebase-functions/logger";
import { db } from "./admin";
import { callGemini } from "./gemini";
import { executeAgentAction } from "./executeAgentAction";
import { loadKnowledgeBase } from "./agents/knowledge";
import { TargetSystem } from "./types";

/**
 * Conversational layer for the agents.
 *
 * `chatWithAgent` powers both:
 *   - direct chat with a single connection agent (scoped to its channel + tools)
 *   - Ivy, the orchestrator, who can read across every agent and delegate actions
 *
 * Every ACTION a chat wants to take is routed through `executeAgentAction`, so
 * the workspace mode + approval rules are respected exactly like the automated
 * agents (Supervised → queued for approval, Autopilot → executed, Off → nothing).
 */

export type ChatTurn = { role: "user" | "ivy"; text: string };

type ConnType = "google-workspace" | "smtp" | "microsoft365" | "whatsapp" | "zoho" | "website";

const CHANNEL_TARGET: Record<string, TargetSystem> = {
  "google-workspace": "gmail",
  smtp: "smtp",
  microsoft365: "microsoft365",
  whatsapp: "whatsapp",
};

const AGENT_LABEL: Record<string, string> = {
  ivy: "Ivy",
  "google-workspace": "Gmail Agent",
  smtp: "SMTP Agent",
  microsoft365: "Microsoft 365 Agent",
  whatsapp: "WhatsApp Agent",
  zoho: "Zoho CRM Agent",
  website: "Website Agent",
};

// ---------------------------------------------------------------------------
// Tool declarations (Gemini function calling)
// ---------------------------------------------------------------------------

const T = {
  search_conversations: {
    name: "search_conversations",
    description:
      "List recent customer conversations from the unified inbox. Use to answer questions about who reached out, leads, or open threads.",
    parameters: {
      type: "object",
      properties: {
        channel: {
          type: "string",
          description: "Optional channel filter: google-workspace | smtp | microsoft365 | whatsapp",
        },
        limit: { type: "number", description: "Max conversations (default 8)" },
      },
    },
  },
  get_reports: {
    name: "get_reports",
    description: "Fetch generated business reports (daily/weekly/monthly/quarterly/annual) for the company.",
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", description: "daily | weekly | monthly | quarterly | annual" },
        limit: { type: "number", description: "Max reports (default 6)" },
      },
    },
  },
  get_sales_summary: {
    name: "get_sales_summary",
    description: "Get CRM sales figures from Zoho for the last N days: new leads/contacts/deals, deals won, revenue, pipeline.",
    parameters: {
      type: "object",
      properties: { days: { type: "number", description: "Look-back window in days (default 30)" } },
    },
  },
  get_web_analytics: {
    name: "get_web_analytics",
    description: "Get website analytics for the last N days: page views, unique visitors, top pages and countries.",
    parameters: {
      type: "object",
      properties: { days: { type: "number", description: "Look-back window in days (default 30)" } },
    },
  },
  create_crm_lead: {
    name: "create_crm_lead",
    description: "Create a new lead in Zoho CRM. Goes through the approval gate.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full name of the lead" },
        email: { type: "string" },
        company: { type: "string" },
        notes: { type: "string", description: "Any context about the lead" },
      },
      required: ["name", "email"],
    },
  },
  reply_to_conversation: {
    name: "reply_to_conversation",
    description:
      "Send a reply to a specific conversation (found via search_conversations). Goes through the approval gate.",
    parameters: {
      type: "object",
      properties: {
        conversationId: { type: "string" },
        body: { type: "string", description: "The reply text to send" },
      },
      required: ["conversationId", "body"],
    },
  },
} as const;

type ToolDecl = { name: string; description: string; parameters: Record<string, unknown> };

/** Which tools each agent gets, based on what's connected. */
function toolsFor(agentId: string, connected: Set<string>): ToolDecl[] {
  const tools: ToolDecl[] = [];
  const has = (t: ConnType) => connected.has(t);

  if (agentId === "ivy") {
    tools.push(T.search_conversations, T.get_reports);
    if (has("zoho")) tools.push(T.get_sales_summary, T.create_crm_lead);
    if (has("website")) tools.push(T.get_web_analytics);
    // Ivy can reply on any connected messaging channel
    if (has("google-workspace") || has("smtp") || has("microsoft365") || has("whatsapp")) {
      tools.push(T.reply_to_conversation);
    }
    return tools;
  }

  if (agentId === "zoho") {
    tools.push(T.get_sales_summary, T.create_crm_lead, T.search_conversations);
    return tools;
  }
  if (agentId === "website") {
    tools.push(T.get_web_analytics);
    return tools;
  }
  // messaging agents
  tools.push(T.search_conversations, T.reply_to_conversation);
  return tools;
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function runTool(
  enterpriseId: string,
  agentId: string,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "search_conversations":
      return toolSearchConversations(enterpriseId, agentId, args);
    case "get_reports":
      return toolGetReports(enterpriseId, args);
    case "get_sales_summary":
      return toolSalesSummary(enterpriseId, args);
    case "get_web_analytics":
      return toolWebAnalytics(enterpriseId, args);
    case "create_crm_lead":
      return toolCreateLead(enterpriseId, args);
    case "reply_to_conversation":
      return toolReply(enterpriseId, args);
    default:
      return `Unknown tool ${name}.`;
  }
}

async function toolSearchConversations(enterpriseId: string, agentId: string, args: Record<string, unknown>) {
  const channel = (args.channel as string) || (agentId !== "ivy" && agentId !== "zoho" ? agentId : undefined);
  const limit = Math.min(Number(args.limit) || 8, 20);
  const snap = await db.collection("conversations").where("enterprise_id", "==", enterpriseId).get();
  const rows = snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }))
    .filter((c) => (channel ? c.channel === channel : true))
    .sort(
      (a, b) =>
        ((b.last_message_at as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0) -
        ((a.last_message_at as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0)
    )
    .slice(0, limit)
    .map((c) => ({
      conversationId: c.id,
      channel: c.channel,
      from: c.customer_ref,
      subject: c.subject,
      is_lead: (c.triage as { is_lead?: boolean } | undefined)?.is_lead ?? null,
      last_message_at: (c.last_message_at as FirebaseFirestore.Timestamp)?.toDate?.().toISOString() ?? null,
    }));
  return JSON.stringify(rows);
}

async function toolGetReports(enterpriseId: string, args: Record<string, unknown>) {
  const period = args.period as string | undefined;
  const limit = Math.min(Number(args.limit) || 6, 12);
  const snap = await db.collection("reports").where("enterprise_id", "==", enterpriseId).get();
  const rows = snap.docs
    .map((d) => d.data() as Record<string, unknown>)
    .filter((r) => (period ? r.period === period : true))
    .sort(
      (a, b) =>
        ((b.period_start as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0) -
        ((a.period_start as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0)
    )
    .slice(0, limit)
    .map((r) => ({
      title: r.title,
      period: r.period,
      covers: r.period_label,
      metrics: r.metrics,
      summary: (r.summary as string)?.slice(0, 600),
    }));
  return JSON.stringify(rows);
}

async function toolSalesSummary(enterpriseId: string, args: Record<string, unknown>) {
  const days = Math.min(Number(args.days) || 30, 365);
  const end = new Date();
  const start = new Date(Date.now() - days * 86400000);
  try {
    const { getSalesSummary } = await import("./connections/zoho");
    const s = await getSalesSummary(enterpriseId, start, end);
    return JSON.stringify({ window_days: days, ...s });
  } catch (e) {
    return `Could not read Zoho sales: ${(e as Error).message}`;
  }
}

async function toolWebAnalytics(enterpriseId: string, args: Record<string, unknown>) {
  const days = Math.min(Number(args.days) || 30, 365);
  const since = Date.now() - days * 86400000;
  const snap = await db.collection("analytics_events").where("workspace_id", "==", enterpriseId).get();
  const events = snap.docs
    .map((d) => d.data() as Record<string, unknown>)
    .filter((e) => e.source === "web")
    .filter((e) => ((e.timestamp as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0) >= since)
    .map((e) => e.payload as Record<string, unknown>);
  const pageviews = events.filter((p) => (p?.type ?? "pageview") === "pageview");
  const visitors = new Set(pageviews.map((p) => p?.visitor_id).filter(Boolean));
  const pages: Record<string, number> = {};
  const countries: Record<string, number> = {};
  for (const p of pageviews) {
    const url = (p?.url as string) || "/";
    let path = url;
    try {
      path = new URL(url).pathname;
    } catch {
      /* keep */
    }
    pages[path] = (pages[path] ?? 0) + 1;
    const c = p?.country as string;
    if (c) countries[c] = (countries[c] ?? 0) + 1;
  }
  const top = (m: Record<string, number>) =>
    Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} (${v})`);
  return JSON.stringify({
    window_days: days,
    pageviews: pageviews.length,
    unique_visitors: visitors.size,
    top_pages: top(pages),
    top_countries: top(countries),
  });
}

async function toolCreateLead(enterpriseId: string, args: Record<string, unknown>) {
  const name = String(args.name ?? "").trim();
  const email = String(args.email ?? "").trim();
  if (!name || !email) return "Missing name or email for the lead.";
  const parts = name.split(" ");
  const fields: Record<string, unknown> = {
    Last_Name: parts.length > 1 ? parts.slice(1).join(" ") : name,
    First_Name: parts.length > 1 ? parts[0] : undefined,
    Email: email,
    Company: (args.company as string) || "Unknown",
    Description: (args.notes as string) || "Created via Ellipse chat.",
    Lead_Source: "Ellipse",
  };
  const res = await executeAgentAction({
    enterpriseId,
    agentId: "zoho-agent",
    domain: "assistant",
    actionType: "create_record",
    params: { module: "Leads", fields },
    targetSystem: "zoho",
    reasoning: `Create Zoho lead ${name} <${email}> (requested in chat).`,
  });
  return JSON.stringify({ action: "create_crm_lead", ...res });
}

async function toolReply(enterpriseId: string, args: Record<string, unknown>) {
  const conversationId = String(args.conversationId ?? "");
  const body = String(args.body ?? "");
  if (!conversationId || !body) return "Missing conversationId or body.";
  const conv = await db.doc(`conversations/${conversationId}`).get();
  if (!conv.exists) return "Conversation not found.";
  const c = conv.data() as Record<string, unknown>;
  const channel = c.channel as string;
  const target = CHANNEL_TARGET[channel];
  if (!target) return `Cannot reply on channel ${channel}.`;
  const res = await executeAgentAction({
    enterpriseId,
    agentId: `${channel}-agent`,
    domain: "inbox",
    actionType: "send_reply",
    params: {
      conversationId,
      threadId: c.thread_id,
      to: c.customer_ref,
      subject: c.subject ?? "",
      body,
    },
    targetSystem: target,
    reasoning: `Reply to ${c.customer_ref} (requested in chat).`,
  });
  return JSON.stringify({ action: "reply_to_conversation", ...res });
}

// ---------------------------------------------------------------------------
// Chat entrypoint
// ---------------------------------------------------------------------------

function buildSystem(agentId: string, orgName: string, kb: string): string {
  const label = AGENT_LABEL[agentId] ?? "Agent";
  const base = `You are ${label} for ${orgName}, operating inside Ellipse — a business automation platform. Today is ${new Date().toISOString().slice(0, 10)}.
- Be concise, helpful, and professional. Answer using the tools when the question needs live data.
- When the user asks you to DO something (create a lead, reply to a customer), use the matching action tool. Actions are subject to the workspace approval rules — if an action comes back "pending", tell the user it's been queued for approval; if "executed", confirm it's done; if "off"/"frozen", explain agents aren't currently running.
- Never invent data. If a tool returns nothing, say so.`;

  const scope =
    agentId === "ivy"
      ? `\nYou are the orchestrator: you can see across ALL connected agents (inbox conversations, reports, CRM sales, website analytics) and coordinate actions on any of them.`
      : agentId === "zoho"
      ? `\nYou specialize in the Zoho CRM: sales figures, leads, contacts and deals.`
      : agentId === "website"
      ? `\nYou specialize in website analytics.`
      : `\nYou specialize in the ${label.replace(" Agent", "")} channel: its conversations and replies.`;

  const knowledge = kb ? `\n\n--- Company knowledge base ---\n${kb}` : "";
  return base + scope + knowledge;
}

function renderHistory(history: ChatTurn[]): string {
  return history
    .slice(-10)
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`)
    .join("\n");
}

export async function chatWithAgent(
  enterpriseId: string,
  agentId: string,
  message: string,
  history: ChatTurn[] = []
): Promise<{ reply: string; actions: unknown[] }> {
  const entSnap = await db.doc(`enterprises/${enterpriseId}`).get();
  const orgName = (entSnap.data()?.name as string) || "your company";

  const connSnap = await db.collection("connections").where("enterprise_id", "==", enterpriseId).get();
  const connected = new Set(
    connSnap.docs.map((d) => d.data()).filter((c) => c.status === "active").map((c) => c.type as string)
  );

  const kb = await loadKnowledgeBase(enterpriseId);
  const system = buildSystem(agentId, orgName, kb);
  const tools = toolsFor(agentId, connected);

  const convo = renderHistory(history);
  const prompt = [convo ? `Conversation so far:\n${convo}\n` : "", `User: ${message}`].filter(Boolean).join("\n");

  // Pass 1 — let the agent reason + optionally call tools.
  const first = await callGemini({ system, prompt, tools });

  if (!first.functionCalls.length) {
    return { reply: first.text || "…", actions: [] };
  }

  // Execute tool calls.
  const results: string[] = [];
  const actions: unknown[] = [];
  for (const call of first.functionCalls) {
    try {
      const out = await runTool(enterpriseId, agentId, call.name, call.args);
      results.push(`${call.name} → ${out}`);
      if (call.name === "create_crm_lead" || call.name === "reply_to_conversation") {
        actions.push({ name: call.name, args: call.args, result: out });
      }
    } catch (e) {
      results.push(`${call.name} → error: ${(e as Error).message}`);
    }
  }

  // Pass 2 — turn tool results into a natural reply.
  const prompt2 = [
    convo ? `Conversation so far:\n${convo}\n` : "",
    `User: ${message}`,
    ``,
    `You called tools and got these results:`,
    ...results,
    ``,
    `Now reply to the user in natural language. If an action was queued for approval, say so clearly.`,
  ]
    .filter(Boolean)
    .join("\n");

  const second = await callGemini({ system, prompt: prompt2 });
  logger.info("agent chat", { enterpriseId, agentId, toolCalls: first.functionCalls.length });
  return { reply: second.text || first.text || "Done.", actions };
}
