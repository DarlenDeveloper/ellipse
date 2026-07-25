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
  generate_report: {
    name: "generate_report",
    description:
      "Generate downloadable report file(s) for one or MORE connected sources, built from live data (accurate, not estimated). One Excel per source. Sources: 'zoho' (CRM), 'website' (traffic), 'gmail' | 'smtp' | 'microsoft365' | 'whatsapp' (channel activity). Use ['all'] for every connected source at once. If the user hasn't said which source(s), ASK — listing ONLY the connected ones. Ask the period if missing; for zoho, ask summary or detailed.",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          description: "today | yesterday | week | month | quarter | year. Defaults to today.",
        },
        sources: {
          type: "array",
          items: { type: "string" },
          description: "Which sources to report on, e.g. ['zoho','website','gmail'] or ['all'].",
        },
        detail: {
          type: "string",
          description:
            "For Zoho: 'summary', 'detailed', or 'both'. DEFAULTS TO 'detailed' (includes the summary sheet + per-quote line items). Only set to 'summary' if the user explicitly asks for a summary.",
        },
      },
    },
  },
  generate_owner_analysis: {
    name: "generate_owner_analysis",
    description:
      "OWNER-ONLY. Generate a Quote Owner performance analysis as a downloadable Excel — groups quotes by the employee who created them (Quote Owner) with counts, total and average value, and stage breakdown, all computed from live Zoho data. Use when the org owner asks to analyze/compare team members' quote performance.",
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", description: "today | yesterday | week | month | quarter | year. Defaults to month." },
      },
    },
  },
  create_document: {
    name: "create_document",
    description:
      "Create a document (Word or Excel) and save it to the workspace Data page. Use for quotes, letters, summaries (docx) or tabular exports/lists (xlsx). Only use real data provided or fetched via other tools.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Document title / file name" },
        kind: { type: "string", description: "'docx' for a document, 'xlsx' for a spreadsheet" },
        body: { type: "string", description: "For docx: the full text content (use newlines for paragraphs)." },
        headers: { type: "array", items: { type: "string" }, description: "For xlsx: column headers." },
        rows: {
          type: "array",
          items: { type: "array", items: { type: "string" } },
          description: "For xlsx: rows of cell values matching the headers.",
        },
      },
      required: ["title", "kind"],
    },
  },
} as const;

type ToolDecl = { name: string; description: string; parameters: Record<string, unknown> };

const TOOL_CATALOG: Record<string, ToolDecl> = {
  search_conversations: T.search_conversations,
  get_reports: T.get_reports,
  get_sales_summary: T.get_sales_summary,
  get_web_analytics: T.get_web_analytics,
  create_crm_lead: T.create_crm_lead,
  reply_to_conversation: T.reply_to_conversation,
  create_document: T.create_document,
  generate_report: T.generate_report,
  generate_owner_analysis: T.generate_owner_analysis,
};

const BUILTIN_AGENTS = new Set(["ivy", "zoho", "website", "google-workspace", "smtp", "microsoft365", "whatsapp"]);

/** Which tools each built-in agent gets, based on what's connected. */
function toolsFor(agentId: string, connected: Set<string>): ToolDecl[] {
  const tools: ToolDecl[] = [];
  const has = (t: ConnType) => connected.has(t);

  if (agentId === "ivy") {
    tools.push(T.search_conversations, T.get_reports, T.create_document);
    if (has("zoho")) tools.push(T.get_sales_summary, T.create_crm_lead);
    if (has("website")) tools.push(T.get_web_analytics);
    if (has("google-workspace") || has("smtp") || has("microsoft365") || has("whatsapp")) {
      tools.push(T.reply_to_conversation);
    }
    // Ivy can generate reports across any connected source.
    if (has("zoho") || has("website") || has("google-workspace") || has("smtp") || has("microsoft365") || has("whatsapp")) {
      tools.push(T.generate_report);
    }
    return tools;
  }

  if (agentId === "zoho") {
    tools.push(T.get_sales_summary, T.create_crm_lead, T.search_conversations, T.create_document, T.generate_report);
    return tools;
  }
  if (agentId === "website") {
    tools.push(T.get_web_analytics, T.create_document, T.generate_report);
    return tools;
  }
  // messaging agents
  tools.push(T.search_conversations, T.reply_to_conversation, T.create_document, T.generate_report);
  return tools;
}

type CustomAgent = { name: string; specialty?: string; tools?: string[]; channel?: string };

/** Tools for a user-defined custom agent (its configured subset, gated by connections). */
function toolsForCustom(cfg: CustomAgent, connected: Set<string>): ToolDecl[] {
  const wanted = cfg.tools ?? [];
  return wanted
    .map((t) => TOOL_CATALOG[t])
    .filter((t): t is ToolDecl => {
      if (!t) return false;
      // Gate connection-dependent tools.
      if ((t === T.get_sales_summary || t === T.create_crm_lead) && !connected.has("zoho")) return false;
      if (t === T.get_web_analytics && !connected.has("website")) return false;
      return true;
    });
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function runTool(
  enterpriseId: string,
  agentId: string,
  name: string,
  args: Record<string, unknown>,
  isOwner: boolean
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
    case "create_document":
      return toolCreateDocument(enterpriseId, agentId, args);
    case "generate_report":
      return toolGenerateReport(enterpriseId, agentId, args);
    case "generate_owner_analysis":
      return toolOwnerAnalysis(enterpriseId, agentId, args, isOwner);
    default:
      return `Unknown tool ${name}.`;
  }
}

function periodWindow(p?: string): { start: Date; end: Date; label: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const key = (p || "today").toLowerCase();
  if (key === "yesterday") {
    const end = startOfDay(now);
    return { start: new Date(end.getTime() - 86400000), end, label: "Yesterday" };
  }
  if (key === "week" || key === "7d") return { start: new Date(now.getTime() - 7 * 86400000), end: now, label: "Last 7 days" };
  if (key === "month" || key === "30d") return { start: new Date(now.getTime() - 30 * 86400000), end: now, label: "Last 30 days" };
  if (key === "quarter") return { start: new Date(now.getTime() - 90 * 86400000), end: now, label: "Last quarter" };
  if (key === "year") return { start: new Date(now.getTime() - 365 * 86400000), end: now, label: "Last year" };
  return { start: startOfDay(now), end: now, label: "Today" };
}

// ---- Report gatherers for non-CRM sources ----

async function gatherWebReport(enterpriseId: string, start: Date, end: Date) {
  const snap = await db.collection("analytics_events").where("workspace_id", "==", enterpriseId).get();
  const events = snap.docs
    .map((d) => d.data() as Record<string, unknown>)
    .filter((e) => e.source === "web")
    .filter((e) => {
      const t = (e.timestamp as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0;
      return t >= start.getTime() && t < end.getTime();
    })
    .map((e) => e.payload as Record<string, unknown>);
  const pv = events.filter((p) => (p?.type ?? "pageview") === "pageview");
  const visitors = new Set(pv.map((p) => p?.visitor_id).filter(Boolean));
  const newV = pv.filter((p) => p?.is_new).length;
  const pages: Record<string, number> = {};
  const countries: Record<string, number> = {};
  for (const p of pv) {
    let path = (p?.url as string) || "/";
    try {
      path = new URL(path).pathname;
    } catch {
      /* keep */
    }
    pages[path] = (pages[path] ?? 0) + 1;
    const c = p?.country as string;
    if (c) countries[c] = (countries[c] ?? 0) + 1;
  }
  const sortRows = (m: Record<string, number>) =>
    Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v] as [string, number]);
  return {
    counts: { pageviews: pv.length, unique_visitors: visitors.size, new_visitors: newV },
    pages: sortRows(pages),
    countries: sortRows(countries),
  };
}

async function gatherChannelReport(enterpriseId: string, channel: string, start: Date, end: Date) {
  const s = start.getTime();
  const e = end.getTime();
  const inWin = (ts: unknown) => {
    const t = (ts as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0;
    return t >= s && t < e;
  };
  const msgs = (await db.collection("messages").where("enterprise_id", "==", enterpriseId).get()).docs
    .map((d) => d.data() as Record<string, unknown>)
    .filter((m) => m.channel === channel && inWin(m.timestamp));
  const inbound = msgs.filter((m) => m.sender_type === "customer").length;
  const replies = msgs.filter((m) => m.sender_type !== "customer").length;
  const convs = (await db.collection("conversations").where("enterprise_id", "==", enterpriseId).get()).docs
    .map((d) => d.data() as Record<string, unknown>)
    .filter((c) => c.channel === channel && inWin(c.last_message_at));
  const leads = convs.filter((c) => (c.triage as { is_lead?: boolean } | undefined)?.is_lead).length;
  const rows = convs
    .sort(
      (a, b) =>
        ((b.last_message_at as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0) -
        ((a.last_message_at as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0)
    )
    .map((c) => [
      (c.customer_ref as string) || "",
      (c.subject as string) || "",
      (c.triage as { is_lead?: boolean } | undefined)?.is_lead ? "Yes" : "No",
      (c.last_message_at as FirebaseFirestore.Timestamp)?.toDate?.().toISOString().slice(0, 10) ?? "",
    ] as [string, string, string, string]);
  return {
    counts: { conversations: convs.length, messages_in: inbound, replies_sent: replies, leads },
    rows,
  };
}

type ReportFileRef = { name: string; url: string; type: string };

// Source key → connection type it needs.
const SOURCE_TO_CONN: Record<string, string> = {
  zoho: "zoho",
  website: "website",
  gmail: "google-workspace",
  "google-workspace": "google-workspace",
  smtp: "smtp",
  microsoft365: "microsoft365",
  outlook: "microsoft365",
  whatsapp: "whatsapp",
};

async function buildZohoFiles(
  enterpriseId: string,
  agentId: string,
  start: Date,
  end: Date,
  label: string,
  mode: string
): Promise<ReportFileRef[]> {
  const { getCrmReportData, getQuotesDetailed } = await import("./connections/zoho");
  const { createCrmReport } = await import("./documents");
  const agentLabel = AGENT_LABEL[agentId] ?? "Agent";
  const wantSummary = mode === "summary" || mode === "both";
  const wantDetailed = mode === "detailed" || mode === "both";
  const base = await getCrmReportData(enterpriseId, start, end);
  const out: ReportFileRef[] = [];
  if (wantSummary || (!wantSummary && !wantDetailed)) {
    const docs = await createCrmReport({
      enterpriseId, agentId, agentLabel, logo: "/logos/zoho.png",
      periodLabel: `Zoho CRM — ${label} Summary`, data: base,
    });
    out.push(...docs.map((d) => ({ name: d.name, url: d.url, type: d.type })));
  }
  if (wantDetailed) {
    const quotes = await getQuotesDetailed(enterpriseId, start, end);
    const docs = await createCrmReport({
      enterpriseId, agentId, agentLabel, logo: "/logos/zoho.png",
      periodLabel: `Zoho CRM — ${label} Detailed`, data: { ...base, quotes },
    });
    out.push(...docs.map((d) => ({ name: d.name, url: d.url, type: d.type })));
  }
  return out;
}

async function buildWebFile(enterpriseId: string, agentId: string, start: Date, end: Date, label: string): Promise<ReportFileRef[]> {
  const { createReportWorkbook } = await import("./documents");
  const w = await gatherWebReport(enterpriseId, start, end);
  const doc = await createReportWorkbook({
    enterpriseId, agentId, agentLabel: AGENT_LABEL[agentId] ?? "Agent", logo: "/logos/web.png",
    title: `Website — ${label}`,
    summary: [
      { label: "Page views", value: w.counts.pageviews },
      { label: "Unique visitors", value: w.counts.unique_visitors },
      { label: "New visitors", value: w.counts.new_visitors },
    ],
    sheets: [
      { name: "Top Pages", headers: ["Page", "Views"], rows: w.pages },
      { name: "Top Countries", headers: ["Country", "Visits"], rows: w.countries },
    ],
  });
  return [{ name: doc.name, url: doc.url, type: doc.type }];
}

async function buildChannelFile(
  enterpriseId: string,
  agentId: string,
  connType: string,
  start: Date,
  end: Date,
  label: string
): Promise<ReportFileRef[]> {
  const { createReportWorkbook } = await import("./documents");
  const c = await gatherChannelReport(enterpriseId, connType, start, end);
  const chLabel = CONNECTION_LABEL[connType] ?? connType;
  const doc = await createReportWorkbook({
    enterpriseId, agentId, agentLabel: AGENT_LABEL[agentId] ?? "Agent",
    title: `${chLabel} — ${label}`,
    summary: [
      { label: "Conversations", value: c.counts.conversations },
      { label: "Messages received", value: c.counts.messages_in },
      { label: "Replies sent", value: c.counts.replies_sent },
      { label: "Leads", value: c.counts.leads },
    ],
    sheets: [{ name: "Conversations", headers: ["Customer", "Subject", "Lead", "Last message"], rows: c.rows }],
  });
  return [{ name: doc.name, url: doc.url, type: doc.type }];
}

/** OWNER-ONLY — Quote Owner performance analysis, computed deterministically from Zoho quotes. */
async function toolOwnerAnalysis(enterpriseId: string, agentId: string, args: Record<string, unknown>, isOwner: boolean) {
  if (!isOwner) {
    return JSON.stringify({ error: "This analysis is available to the organization owner only." });
  }
  const connSnap = await db.doc(`connections/${enterpriseId}_zoho`).get();
  if (!connSnap.exists || connSnap.data()?.status !== "active") {
    return JSON.stringify({ connected: false, note: "Zoho CRM is not connected." });
  }
  const { start, end, label } = periodWindow((args.period as string | undefined) ?? "month");
  try {
    const { getQuotesDetailed } = await import("./connections/zoho");
    const { createReportWorkbook } = await import("./documents");
    const quotes = await getQuotesDetailed(enterpriseId, start, end);

    // Group by Quote Owner (the employee who created the quote).
    const byOwner = new Map<string, { count: number; total: number; won: number; stages: Record<string, number> }>();
    for (const q of quotes) {
      const owner = q.owner || "(unassigned)";
      const cur = byOwner.get(owner) ?? { count: 0, total: 0, won: 0, stages: {} };
      cur.count++;
      cur.total += q.sub_total || 0;
      if (/won|confirmed|accepted/i.test(q.stage)) cur.won++;
      cur.stages[q.stage || "—"] = (cur.stages[q.stage || "—"] ?? 0) + 1;
      byOwner.set(owner, cur);
    }

    const rows = [...byOwner.entries()]
      .map(([owner, v]) => [owner, v.count, Math.round(v.total), v.count ? Math.round(v.total / v.count) : 0, v.won] as [string, number, number, number, number])
      .sort((a, b) => b[2] - a[2]);

    const totalQuotes = quotes.length;
    const totalValue = Math.round(quotes.reduce((s, q) => s + (q.sub_total || 0), 0));

    const doc = await createReportWorkbook({
      enterpriseId,
      agentId,
      agentLabel: AGENT_LABEL[agentId] ?? "Agent",
      logo: "/logos/zoho.png",
      title: `Quote Owner Analysis — ${label}`,
      summary: [
        { label: "Total quotes", value: totalQuotes },
        { label: "Total value", value: totalValue },
        { label: "Team members with quotes", value: byOwner.size },
      ],
      sheets: [
        {
          name: "By Owner",
          headers: ["Quote Owner", "Quotes", "Total Sub Total", "Avg Sub Total", "Won"],
          rows,
        },
      ],
    });

    return JSON.stringify({
      action: "generate_owner_analysis",
      status: "analysis generated and saved to Data",
      period: label,
      owners: byOwner.size,
      total_quotes: totalQuotes,
      files: [{ name: doc.name, url: doc.url, type: doc.type }],
    });
  } catch (e) {
    return JSON.stringify({ error: `Could not build owner analysis: ${(e as Error).message}` });
  }
}

/** Multi-source report generator: one Excel per requested (and connected) source. */
async function toolGenerateReport(enterpriseId: string, agentId: string, args: Record<string, unknown>) {
  // Which sources are connected + report-capable?
  const connSnap = await db.collection("connections").where("enterprise_id", "==", enterpriseId).get();
  const connected = new Set(
    connSnap.docs.map((d) => d.data()).filter((c) => c.status === "active").map((c) => c.type as string)
  );
  const capable = ["zoho", "website", "google-workspace", "smtp", "microsoft365", "whatsapp"].filter((t) =>
    connected.has(t)
  );
  if (capable.length === 0) {
    return JSON.stringify({ note: "No connected source can produce a report yet. Connect an integration first." });
  }

  // Resolve requested sources → connection types (default: all connected capable).
  let requested = (args.sources as string[] | undefined)?.map((s) => s.toLowerCase()) ?? [];
  if (requested.length === 0 || requested.includes("all")) {
    requested = capable;
  } else {
    requested = requested.map((s) => SOURCE_TO_CONN[s] ?? s).filter((t) => capable.includes(t));
  }
  requested = [...new Set(requested)];
  if (requested.length === 0) {
    return JSON.stringify({
      note: `None of the requested sources are connected. Connected sources: ${capable
        .map((t) => CONNECTION_LABEL[t])
        .join(", ")}.`,
    });
  }

  const { start, end, label } = periodWindow(args.period as string | undefined);
  // Default to DETAILED — it includes the summary sheet plus the per-quote line items.
  const mode = String(args.detail ?? "detailed").toLowerCase();
  const files: ReportFileRef[] = [];
  const perSource: Record<string, string> = {};

  for (const conn of requested) {
    try {
      let f: ReportFileRef[] = [];
      if (conn === "zoho") f = await buildZohoFiles(enterpriseId, agentId, start, end, label, mode);
      else if (conn === "website") f = await buildWebFile(enterpriseId, agentId, start, end, label);
      else f = await buildChannelFile(enterpriseId, agentId, conn, start, end, label);
      files.push(...f);
      perSource[CONNECTION_LABEL[conn] ?? conn] = `${f.length} file(s)`;
    } catch (e) {
      perSource[CONNECTION_LABEL[conn] ?? conn] = `failed: ${(e as Error).message}`;
    }
  }

  return JSON.stringify({
    action: "generate_report",
    status: "reports generated and saved to Data",
    period: label,
    sources: requested.map((t) => CONNECTION_LABEL[t] ?? t),
    per_source: perSource,
    files,
  });
}

async function toolCreateDocument(enterpriseId: string, agentId: string, args: Record<string, unknown>) {
  const title = String(args.title ?? "").trim();
  const kind = (args.kind as string) === "xlsx" ? "xlsx" : "docx";
  if (!title) return "Missing document title.";
  try {
    const { createDocument } = await import("./documents");
    const rowsRaw = (args.rows as unknown[]) ?? [];
    const rows = rowsRaw.map((r) => (Array.isArray(r) ? r.map((c) => String(c)) : [String(r)]));
    const doc = await createDocument({
      enterpriseId,
      agentId,
      agentLabel: AGENT_LABEL[agentId] ?? "Agent",
      title,
      kind,
      body: args.body as string | undefined,
      headers: (args.headers as string[]) ?? [],
      rows,
    });

    // Every document is saved to Data. If Microsoft 365 is connected, also mirror
    // it to the customer's OneDrive — routed through the gate (approval-respecting).
    let onedrive: string | undefined;
    try {
      const { isMicrosoftConnected } = await import("./connections/microsoft365");
      if (await isMicrosoftConnected(enterpriseId)) {
        const res = await executeAgentAction({
          enterpriseId,
          agentId: "microsoft365-agent",
          domain: "files",
          actionType: "save_file",
          params: {
            fileName: doc.name,
            folder: "Ellipse Documents",
            storagePath: doc.storage_path,
            contentType: doc.content_type,
          },
          targetSystem: "microsoft365",
          reasoning: `Save "${doc.name}" to Microsoft 365.`,
        });
        onedrive = res.status === "pending" ? "queued for approval" : res.status === "executed" ? "uploaded" : undefined;
      }
    } catch (e) {
      logger.warn("document onedrive mirror failed", { error: (e as Error).message });
    }

    return JSON.stringify({
      action: "create_document",
      status: "saved to Data",
      name: doc.name,
      url: doc.url,
      microsoft365: onedrive ?? "not connected — saved to Data only",
    });
  } catch (e) {
    return `Could not create document: ${(e as Error).message}`;
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
  // Confirm Zoho is actually connected first, so "not connected" isn't reported as zero.
  const connSnap = await db.doc(`connections/${enterpriseId}_zoho`).get();
  if (!connSnap.exists || connSnap.data()?.status !== "active") {
    return JSON.stringify({ connected: false, note: "Zoho CRM is not connected for this workspace." });
  }
  try {
    const { getSalesSummary } = await import("./connections/zoho");
    const s = await getSalesSummary(enterpriseId, start, end);
    const anyNew = s.leads_created + s.contacts_created + s.deals_created > 0;
    return JSON.stringify({
      connected: true,
      window_days: days,
      note: anyNew
        ? undefined
        : `No NEW leads/contacts/deals were created in the last ${days} days. The current open pipeline figures below reflect the CRM's live state regardless of when records were created.`,
      ...s,
    });
  } catch (e) {
    return JSON.stringify({ connected: true, error: `Zoho read failed: ${(e as Error).message}` });
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

const CONNECTION_LABEL: Record<string, string> = {
  "google-workspace": "Gmail",
  smtp: "SMTP email",
  microsoft365: "Microsoft 365 (Outlook)",
  whatsapp: "WhatsApp",
  zoho: "Zoho CRM",
  website: "Website analytics",
};

function buildSystem(
  agentId: string,
  label: string,
  orgName: string,
  kb: string,
  connected: Set<string>,
  customSpecialty?: string
): string {
  const base = `You are ${label} for ${orgName}, operating inside Ellipse — a business automation platform. Today is ${new Date().toISOString().slice(0, 10)}.
- Be concise, helpful, and professional. Answer using the tools when the question needs live data.
- When the user asks you to DO something (create a lead, reply to a customer, make a document), use the matching action tool. Actions are subject to the workspace approval rules — if an action comes back "pending", tell the user it's been queued for approval; if "executed"/"saved", confirm it's done; if "off"/"frozen", explain agents aren't currently running.
- STRICT no-hallucination: never invent facts, numbers, names, customers, emails, deals, prices or metrics. Only state what a tool returned or what the user/knowledge base gave you. If you don't have the data, say you don't have it and offer to fetch it with a tool. Do not guess.
- ASK BEFORE ACTING when a request is ambiguous. If the user asks for something under-specified — e.g. "get me a report" (which report: CRM/sales, website analytics, or a cross-channel summary? which period: today, this week, this month?), or an action with missing details (who to email, which lead to create) — ask ONE short clarifying question first and do NOT call a tool yet. Once the answer is clear (or the user already specified it), proceed immediately without asking again. Don't over-ask when intent is obvious.
- Stay within your specialty. If a request is outside your area, say so and (if you're a specialist agent) suggest asking Ivy, who can coordinate across agents.`;

  let scope: string;
  if (customSpecialty) {
    scope = `\n\nYour role and specialty:\n${customSpecialty}`;
  } else if (agentId === "ivy") {
    scope = `\nYou are the orchestrator: you can see across ALL connected agents (inbox conversations, reports, CRM sales, website analytics), create documents, and coordinate actions on any of them.`;
  } else if (agentId === "zoho") {
    scope = `\nYou are the Zoho CRM specialist: sales figures, leads, contacts and deals. You are excellent at CRM work and nothing else — defer non-CRM questions.`;
  } else if (agentId === "website") {
    scope = `\nYou are the website analytics specialist: traffic, visitors, pages, geography. Defer non-analytics questions.`;
  } else {
    scope = `\nYou are the ${label.replace(" Agent", "")} channel specialist: its conversations and replies. You know this channel deeply and defer questions about other channels.`;
  }

  const connectedNames = [...connected].map((t) => CONNECTION_LABEL[t]).filter(Boolean);
  const connLine = connectedNames.length
    ? `\n\nConnected integrations for this workspace: ${connectedNames.join(", ")}. When asking the user to choose a source/channel for a report or action, ONLY offer options from THIS list. NEVER offer or mention an integration that isn't in this list (e.g. don't suggest WhatsApp if it's not connected). Reports/exports as downloadable files are currently available for Zoho CRM only — if the user wants another source, answer from its data but say a file export isn't available for it yet.`
    : `\n\nNo integrations are connected yet — tell the user to connect one before you can pull data.`;

  const knowledge = kb ? `\n\n--- Company knowledge base (authoritative facts) ---\n${kb}` : "";
  return base + scope + connLine + knowledge;
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
  history: ChatTurn[] = [],
  callerUid?: string
): Promise<{ reply: string; actions: unknown[]; files: { name: string; url: string; type: string }[] }> {
  const entSnap = await db.doc(`enterprises/${enterpriseId}`).get();
  const orgName = (entSnap.data()?.name as string) || "your company";

  // Is the caller the organization owner? (Gates owner-only analyses.)
  let isOwner = false;
  if (callerUid) {
    const userSnap = await db.doc(`users/${callerUid}`).get();
    const u = userSnap.data();
    isOwner = u?.enterprise_id === enterpriseId && u?.role === "owner";
  }

  const connSnap = await db.collection("connections").where("enterprise_id", "==", enterpriseId).get();
  const connected = new Set(
    connSnap.docs.map((d) => d.data()).filter((c) => c.status === "active").map((c) => c.type as string)
  );

  const kb = await loadKnowledgeBase(enterpriseId);

  // Custom (user-defined) agent? Load its config; otherwise use the built-in.
  let label = AGENT_LABEL[agentId] ?? "Agent";
  let system: string;
  let tools: ToolDecl[];
  if (BUILTIN_AGENTS.has(agentId)) {
    system = buildSystem(agentId, label, orgName, kb, connected);
    tools = toolsFor(agentId, connected);
  } else {
    const caSnap = await db.doc(`custom_agents/${agentId}`).get();
    if (!caSnap.exists || caSnap.data()?.enterprise_id !== enterpriseId) {
      return { reply: "This agent no longer exists.", actions: [], files: [] };
    }
    const cfg = caSnap.data() as CustomAgent & { enterprise_id: string };
    label = cfg.name || "Custom Agent";
    system = buildSystem(agentId, label, orgName, kb, connected, cfg.specialty);
    tools = toolsForCustom(cfg, connected);
  }

  // Owner-only: Quote Owner analysis (Ivy or Zoho agent, when Zoho is connected).
  if (isOwner && connected.has("zoho") && (agentId === "ivy" || agentId === "zoho")) {
    tools.push(T.generate_owner_analysis);
  }

  const convo = renderHistory(history);
  const prompt = [convo ? `Conversation so far:\n${convo}\n` : "", `User: ${message}`].filter(Boolean).join("\n");

  // Pass 1 — let the agent reason + optionally call tools. Low temperature to curb speculation.
  const first = await callGemini({ system, prompt, tools, temperature: 0.1 });

  if (!first.functionCalls.length) {
    return { reply: first.text || "…", actions: [], files: [] };
  }

  // Execute tool calls.
  const results: string[] = [];
  const actions: unknown[] = [];
  const files: { name: string; url: string; type: string }[] = [];
  for (const call of first.functionCalls) {
    try {
      const out = await runTool(enterpriseId, agentId, call.name, call.args, isOwner);
      logger.info("tool result", { agentId, tool: call.name, enterpriseId, out: out.slice(0, 500) });
      results.push(`${call.name} → ${out}`);
      if (["create_crm_lead", "reply_to_conversation", "create_document", "generate_report", "generate_owner_analysis"].includes(call.name)) {
        actions.push({ name: call.name, args: call.args, result: out });
      }
      // Surface created documents/reports as downloadable file cards (not raw URLs in text).
      if (call.name === "create_document" || call.name === "generate_report" || call.name === "generate_owner_analysis") {
        try {
          const parsed = JSON.parse(out) as { name?: string; url?: string; files?: { name: string; url: string; type?: string }[] };
          if (Array.isArray(parsed.files)) {
            for (const f of parsed.files) {
              if (f.url && f.name) files.push({ name: f.name, url: f.url, type: f.type || f.name.split(".").pop() || "file" });
            }
          } else if (parsed.url && parsed.name) {
            files.push({ name: parsed.name, url: parsed.url, type: parsed.name.split(".").pop() || "file" });
          }
        } catch {
          /* ignore */
        }
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
    `Now write the FINAL reply to the user. Rules:`,
    `- Use ONLY the tool results above. State exactly what the data shows.`,
    `- Do NOT invent, infer, or add any leads, names, companies, numbers, deals or pipeline that are not explicitly present in the results.`,
    `- No preamble, no "let me check", no describing what you did — just the answer.`,
    `- Keep it to 1-3 sentences (plus a short list only if the data has items).`,
    `- If a tool returned connected:false or an error, tell the user plainly.`,
    files.length
      ? `- A file was created and shown as a downloadable card below your message. Do NOT paste the file URL — refer to it by name.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const second = await callGemini({ system, prompt: prompt2, temperature: 0 });
  logger.info("agent chat", { enterpriseId, agentId, toolCalls: first.functionCalls.length });
  return { reply: second.text || first.text || "Done.", actions, files };
}
