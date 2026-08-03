import * as logger from "firebase-functions/logger";
import { randomUUID } from "crypto";
import { db, FieldValue } from "./admin";
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
 * Most actions route through `executeAgentAction`. Quotations are the deliberate
 * exception: they execute immediately and write an executed audit record.
 */

export type ChatAction = { name: string; args?: Record<string, unknown>; result?: string };
export type ChatTurn = { role: "user" | "ivy"; text: string; actions?: ChatAction[] };

type ConnType = "google-workspace" | "smtp" | "microsoft365" | "whatsapp" | "zoho" | "website" | "mercury";

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
  mercury: "Mercury Store Agent",
};

const AGENT_LOGO: Record<string, string> = {
  zoho: "/logos/zoho.png",
  website: "/logos/web.png",
  mercury: "/logos/mercury.png",
};

// ---------------------------------------------------------------------------
// Tool declarations (Gemini function calling)
// ---------------------------------------------------------------------------

const T = {
  get_action_status: {
    name: "get_action_status",
    description:
      "Check the authoritative status and output of a previously queued action using its pendingActionId. " +
      "Always use this before claiming a queued action completed or before using/sharing its output.",
    parameters: {
      type: "object",
      properties: { actionId: { type: "string", description: "The pendingActionId returned by an earlier action." } },
      required: ["actionId"],
    },
  },
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
  list_leads: {
    name: "list_leads",
    description:
      "List actual Zoho CRM leads (real rows: name, company, email, phone, owner, status, source, created date), newest first. " +
      "Use this for ANY question that asks for specific leads — 'top/recent/latest leads', 'which leads', 'unattended leads' " +
      "(unattended = no owner assigned or status still 'New'/not contacted), leads from a period, etc. " +
      "NEVER invent lead names, companies or dates — only report what this returns. Use get_sales_summary only for counts/totals, not for listing leads.",
    parameters: {
      type: "object",
      properties: {
        days: { type: "number", description: "How far back to look, in days (default 90)." },
        limit: { type: "number", description: "Max leads to return (default 25, max 200)." },
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
        attachDocumentId: { type: "string", description: "Optional Ellipse Data document id to attach. For quotations, first use find_zoho_quotation and pass its documentId here." },
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
  store_list: {
    name: "store_list",
    description:
      "Search or list records from the Mercury Store: products, orders, quotations, or repairs. " +
      "You MUST call this before answering ANY question about store data — including whether records exist, " +
      "counts, availability, or details. NEVER answer 'there are none' / 'no X in the system' without calling this first. " +
      "Examples: 'are there any quotation requests?' -> resource:'quotations'; 'any pending orders?' -> resource:'orders', status:'pending'; " +
      "'open repairs?' -> resource:'repairs'. " +
      "For products, ALWAYS pass `q` to find items by name/brand/model (e.g. 'do you have Lenovo laptops?' -> resource:'products', q:'lenovo laptop'); " +
      "the catalog has 300+ items, so never conclude a product is unavailable from a plain list — search with `q` (or `brand`/`category`). " +
      "The result includes `total` (exact match count) so you can answer 'how many' accurately.",
    parameters: {
      type: "object",
      properties: {
        resource: { type: "string", description: "products | orders | quotations | repairs" },
        q: { type: "string", description: "Text search across name/brand/category (products). Use for 'do you have X' / find-by-name questions." },
        brand: { type: "string", description: "Exact brand filter, e.g. lenovo, hp, dell." },
        category: { type: "string", description: "Exact category filter." },
        categoryId: { type: "string", description: "Exact categoryId filter, e.g. laptops." },
        status: { type: "string", description: "Status filter, e.g. pending, completed, published, out_of_stock." },
        limit: { type: "number", description: "Max items when doing a plain list without search (default 50, max 200)." },
      },
      required: ["resource"],
    },
  },
  store_get: {
    name: "store_get",
    description: "Get a single Mercury Store record by id (products/orders/quotations/repairs).",
    parameters: {
      type: "object",
      properties: {
        resource: { type: "string", description: "products | orders | quotations | repairs" },
        id: { type: "string" },
      },
      required: ["resource", "id"],
    },
  },
  store_create: {
    name: "store_create",
    description:
      "Create a Mercury Store record (product/order/quotation/repair). Goes through the approval gate. Provide the fields as an object.",
    parameters: {
      type: "object",
      properties: {
        resource: { type: "string", description: "products | orders | quotations | repairs" },
        fields: { type: "object", description: "The record fields to set." },
      },
      required: ["resource", "fields"],
    },
  },
  store_update: {
    name: "store_update",
    description:
      "Update a Mercury Store record by id (partial update). Goes through the approval gate. e.g. mark an order completed, adjust product stock, set a quotation's quoted price.",
    parameters: {
      type: "object",
      properties: {
        resource: { type: "string", description: "products | orders | quotations | repairs" },
        id: { type: "string" },
        fields: { type: "object", description: "Only the fields to change." },
      },
      required: ["resource", "id", "fields"],
    },
  },
  create_quotation: {
    name: "create_quotation",
    description:
      "Generate a branded proforma-invoice / quotation PDF and save it to the workspace Data page. " +
      "The company letterhead (logo, name, TIN, address, VAT rate and terms) comes from the org's saved quotation branding — do NOT invent those. " +
      "You provide the client details and the line items. Amounts, subtotal, VAT and total are computed automatically — never state or pre-compute them yourself. " +
      "For each item pass its unit price as `rate` and quantity as `qty`. When items refer to store products, look up their real price first with store_list (q search). " +
      "Set vatExempt:true only if the user says the quote is VAT/withholding exempt.",
    parameters: {
      type: "object",
      properties: {
        client: {
          type: "object",
          description: "Client / recipient details.",
          properties: {
            name: { type: "string" },
            address: { type: "string" },
            tin: { type: "string" },
            contact_person: { type: "string" },
            contact_no: { type: "string" },
            email: { type: "string" },
          },
        },
        items: {
          type: "array",
          description: "Line items.",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              rate: { type: "number", description: "Unit price." },
              qty: { type: "number", description: "Quantity." },
            },
            required: ["description", "rate", "qty"],
          },
        },
        currency: { type: "string", description: "Currency code, default UGX." },
        vatExempt: { type: "boolean", description: "True if VAT/withholding exempt (VAT becomes 0)." },
        title: { type: "string", description: "Optional document title." },
      },
      required: ["client", "items"],
    },
  },
  create_zoho_quotation: {
    name: "create_zoho_quotation",
    description:
      "Immediately create or reuse the customer Lead, Account and Contact, create a fresh Deal, convert authoritative Mercury USD VAT-inclusive prices to UGX, generate a consistently formatted PDF with the Ellipse quotation template, save it to Data and return it in chat. The completed action is audited without waiting for approval.",
    parameters: {
      type: "object",
      properties: {
        customer: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            company: { type: "string" },
            phone: { type: "string" },
            billingCity: { type: "string", description: "Customer billing city / location." },
            tin: { type: "string", description: "Client tax identification number, saved on the Zoho Account." },
          },
          required: ["name", "email"],
        },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              product: { type: "string", description: "Exact Zoho Product name or SKU." },
              quantity: { type: "number" },
              rate: { type: "number", description: "Required unit price from the user or authoritative knowledge base." },
              rateCurrency: { type: "string", description: "Currency of the source price. Mercury catalogue prices are USD." },
              rateIncludesVat: { type: "boolean", description: "Mercury catalogue prices include 18% VAT; defaults to true." },
              description: { type: "string", description: "Optional quotation-line description; defaults to the Zoho Product description." },
            },
            required: ["product", "quantity", "rate"],
          },
        },
        subject: { type: "string" },
        quoteDate: { type: "string", description: "Quote date in YYYY-MM-DD format; defaults to today." },
        dealName: { type: "string", description: "Optional Zoho Deal name; defaults to '<company> - Quotation'." },
        currency: { type: "string", description: "Currency code; defaults to UGX." },
        vatExempt: { type: "boolean", description: "Set only when the user confirms VAT exemption." },
        bankDetails: { type: "string", description: "Optional bank details; normally loaded automatically from the 'Bank Details' knowledge-base entry." },
      },
      required: ["customer", "items"],
    },
  },
  find_zoho_quotation: {
    name: "find_zoho_quotation",
    description: "Find a Zoho-generated quotation already saved in Ellipse Data. Use before emailing an earlier quotation so the exact saved file is reused.",
    parameters: {
      type: "object",
      properties: {
        email: { type: "string", description: "Customer email." },
        quoteId: { type: "string", description: "Optional Zoho Quote record id." },
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
  get_zoho_quote: {
    name: "get_zoho_quote",
    description:
      "Fetch a single existing Zoho CRM quote INCLUDING its line items (description, unit price, quantity). " +
      "Use for verified quote details and lookup by proforma number, subject, or account name. " +
      "Do not turn it into a manually generated quotation when Zoho is connected.",
    parameters: {
      type: "object",
      properties: {
        proforma: { type: "string", description: "Proforma / quote number to match exactly." },
        subject: { type: "string", description: "Quote subject (prefix match)." },
        account: { type: "string", description: "Account/company name on the quote." },
      },
    },
  },
  send_email: {
    name: "send_email",
    description:
      "Send an email to ANY recipient address (a brand-new email, not a reply). " +
      "Use when the user says something like 'email this to example@gmail.com'. " +
      "Optionally attach a document created earlier in this chat (e.g. a quotation/proforma) by passing its documentId. " +
      "The email is routed through the approval gate — in supervised mode it is queued in Approvals for the user to approve before it actually sends. " +
      "Requires a connected email channel (Gmail, Microsoft 365/Outlook, or SMTP). Write a clear, professional subject and body.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address." },
        subject: { type: "string", description: "Email subject." },
        body: { type: "string", description: "Email body (plain text)." },
        cc: { type: "string", description: "Optional CC address." },
        attachDocumentId: { type: "string", description: "Optional: id of a document/quotation created earlier in this chat to attach." },
      },
      required: ["to", "subject", "body"],
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
  get_action_status: T.get_action_status,
  search_conversations: T.search_conversations,
  get_reports: T.get_reports,
  get_sales_summary: T.get_sales_summary,
  list_leads: T.list_leads,
  get_web_analytics: T.get_web_analytics,
  create_crm_lead: T.create_crm_lead,
  reply_to_conversation: T.reply_to_conversation,
  create_document: T.create_document,
  generate_report: T.generate_report,
  generate_owner_analysis: T.generate_owner_analysis,
  store_list: T.store_list,
  store_get: T.store_get,
  store_create: T.store_create,
  store_update: T.store_update,
  create_quotation: T.create_quotation,
  create_zoho_quotation: T.create_zoho_quotation,
  find_zoho_quotation: T.find_zoho_quotation,
  send_email: T.send_email,
  get_zoho_quote: T.get_zoho_quote,
};

const BUILTIN_AGENTS = new Set(["ivy", "zoho", "website", "google-workspace", "smtp", "microsoft365", "whatsapp", "mercury"]);
const ZOHO_TOOL_NAMES = new Set(["get_sales_summary", "list_leads", "create_crm_lead", "get_zoho_quote", "create_zoho_quotation", "find_zoho_quotation"]);
const AGENT_CONNECTION: Record<string, string> = {
  zoho: "zoho",
  website: "website",
  "google-workspace": "google-workspace",
  smtp: "smtp",
  microsoft365: "microsoft365",
  whatsapp: "whatsapp",
  mercury: "mercury",
};

/** Which tools each built-in agent gets, based on what's connected. */
function toolsFor(agentId: string, connected: Set<string>): ToolDecl[] {
  const tools: ToolDecl[] = [T.get_action_status];
  const has = (t: ConnType) => connected.has(t);

  if (agentId === "ivy") {
    tools.push(T.search_conversations, T.get_reports, T.create_document);
    if (has("zoho")) tools.push(T.get_sales_summary, T.list_leads, T.create_crm_lead, T.get_zoho_quote, T.create_zoho_quotation, T.find_zoho_quotation);
    if (has("website")) tools.push(T.get_web_analytics);
    // Manual quotation generation is fallback-only. With Zoho connected, all
    // official quotations must use Zoho's Quote + Writer PDF workflow.
    if (has("mercury") && !has("zoho")) tools.push(T.create_quotation);
    if (has("google-workspace") || has("smtp") || has("microsoft365") || has("whatsapp")) {
      tools.push(T.reply_to_conversation);
    }
    // Send a brand-new email to any address (gated) if an email channel is connected.
    if (has("google-workspace") || has("smtp") || has("microsoft365")) {
      tools.push(T.send_email);
    }
    // Ivy can generate reports across any connected source.
    if (has("zoho") || has("website") || has("google-workspace") || has("smtp") || has("microsoft365") || has("whatsapp")) {
      tools.push(T.generate_report);
    }
    // Mercury Store (custom external API).
    if (has("mercury")) {
      tools.push(T.store_list, T.store_get, T.store_create, T.store_update);
    }
    return tools;
  }

  if (agentId === "zoho") {
    tools.push(
      T.get_sales_summary,
      T.list_leads,
      T.create_crm_lead,
      T.search_conversations,
      T.create_document,
      T.generate_report,
      T.get_zoho_quote,
      T.create_zoho_quotation,
      T.find_zoho_quotation
    );
    return tools;
  }
  if (agentId === "website") {
    tools.push(T.get_web_analytics, T.create_document, T.generate_report);
    return tools;
  }
  if (agentId === "mercury") {
    tools.push(T.store_list, T.store_get, T.store_create, T.store_update, T.create_document);
    if (!has("zoho")) tools.push(T.create_quotation);
    return tools;
  }
  // messaging agents
  tools.push(T.search_conversations, T.reply_to_conversation, T.create_document, T.generate_report);
  // Email-capable channel agents can also send fresh emails to any address.
  if (agentId === "google-workspace" || agentId === "smtp" || agentId === "microsoft365") {
    tools.push(T.send_email);
  }
  return tools;
}

type CustomAgent = { name: string; specialty?: string; tools?: string[]; channel?: string };

/** Tools for a user-defined custom agent (its configured subset, gated by connections). */
function toolsForCustom(cfg: CustomAgent, connected: Set<string>): ToolDecl[] {
  const wanted = (cfg.tools ?? []).filter((name) => name !== "get_action_status");
  return [T.get_action_status, ...wanted
    .map((t) => TOOL_CATALOG[t])
    .filter((t): t is ToolDecl => {
      if (!t) return false;
      // Gate connection-dependent tools.
      if ((t === T.get_sales_summary || t === T.create_crm_lead) && !connected.has("zoho")) return false;
      if (t === T.get_web_analytics && !connected.has("website")) return false;
      if (t === T.create_quotation && connected.has("zoho")) return false;
      return true;
    })];
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function runTool(
  enterpriseId: string,
  agentId: string,
  name: string,
  args: Record<string, unknown>,
  isOwner: boolean,
  allowedConnections: Set<string>,
  callerUid?: string,
  personalZohoOwnerUid?: string,
  requiresEmailAttachment = false,
  currentUserMessage = "",
  recentConversation = ""
): Promise<string> {
  if (personalZohoOwnerUid && ZOHO_TOOL_NAMES.has(name)) {
    const { withZohoConnectionOwner } = await import("./connections/zoho");
    return withZohoConnectionOwner(personalZohoOwnerUid, () =>
      runTool(enterpriseId, agentId, name, { ...args, connectionOwnerUid: personalZohoOwnerUid }, isOwner, allowedConnections, callerUid, undefined, requiresEmailAttachment, currentUserMessage, recentConversation)
    );
  }
  switch (name) {
    case "get_action_status":
      return toolGetActionStatus(enterpriseId, args);
    case "search_conversations":
      return toolSearchConversations(enterpriseId, agentId, args, allowedConnections, callerUid);
    case "get_reports":
      return toolGetReports(enterpriseId, args, callerUid);
    case "get_sales_summary":
      return toolSalesSummary(enterpriseId, args);
    case "list_leads":
      return toolListLeads(enterpriseId, args);
    case "get_web_analytics":
      return toolWebAnalytics(enterpriseId, args);
    case "create_crm_lead":
      return toolCreateLead(enterpriseId, args);
    case "reply_to_conversation":
      return toolReply(enterpriseId, args, callerUid);
    case "create_document":
      return toolCreateDocument(enterpriseId, agentId, args);
    case "generate_report":
      return toolGenerateReport(enterpriseId, agentId, args, allowedConnections, callerUid);
    case "generate_owner_analysis":
      return toolOwnerAnalysis(enterpriseId, agentId, args, isOwner);
    case "store_list":
      return toolStoreList(enterpriseId, args);
    case "store_get":
      return toolStoreGet(enterpriseId, args);
    case "store_create":
      return toolStoreWrite(enterpriseId, "create_record", args);
    case "store_update":
      return toolStoreWrite(enterpriseId, "update_record", args);
    case "create_quotation":
      return toolCreateQuotation(enterpriseId, agentId, args);
    case "create_zoho_quotation":
      return toolCreateZohoQuotation(enterpriseId, agentId, args, currentUserMessage, recentConversation, callerUid);
    case "find_zoho_quotation":
      return toolFindZohoQuotation(enterpriseId, args);
    case "send_email":
      return toolSendEmail(enterpriseId, agentId, args, callerUid, requiresEmailAttachment);
    case "get_zoho_quote":
      return toolGetZohoQuote(enterpriseId, args);
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
async function toolGenerateReport(
  enterpriseId: string,
  agentId: string,
  args: Record<string, unknown>,
  allowedConnections: Set<string>,
  callerUid?: string
) {
  // Which sources are connected + report-capable?
  const connSnap = await db.collection("connections").where("enterprise_id", "==", enterpriseId).get();
  const orgConnected = new Set(
    connSnap.docs.map((d) => d.data()).filter((c) => c.status === "active").map((c) => c.type as string)
  );
  let reportAllowed = allowedConnections;
  if (callerUid) {
    const user = (await db.doc(`users/${callerUid}`).get()).data();
    if (user?.role !== "owner" && user?.role !== "admin") {
      const grant = (await db.doc(`connection_grants/${enterpriseId}_${callerUid}`).get()).data();
      reportAllowed = new Set((grant?.types as string[] | undefined) ?? []);
    }
  }
  const capable = ["zoho", "website", "google-workspace", "smtp", "microsoft365", "whatsapp"].filter((t) =>
    orgConnected.has(t) && reportAllowed.has(t)
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

// ---- Mercury Store tools ----

async function toolStoreList(enterpriseId: string, args: Record<string, unknown>) {
  const resource = String(args.resource ?? "");
  const q = (args.q ?? args.query ?? args.search) as string | undefined;
  try {
    const { listResource, listAllResource } = await import("./connections/mercury");
    const opts = {
      status: args.status as string | undefined,
      q: q ? String(q) : undefined,
      brand: args.brand as string | undefined,
      category: args.category as string | undefined,
      categoryId: args.categoryId as string | undefined,
    };
    // When searching or filtering, sweep every page via the cursor so we never
    // miss matches beyond the first page (the catalog spans 300+ products).
    if (opts.q || opts.brand || opts.category || opts.categoryId || opts.status) {
      const { items, total } = await listAllResource(enterpriseId, resource, opts, 1000);
      const queryTerms = String(opts.q ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ")
        .filter((term) => term.length > 1 && !["the", "with", "for"].includes(term));
      const relevantItems = resource === "products" && queryTerms.length
        ? items
          .map((item: any) => {
            const name = String(item.name ?? item.productName ?? item.title ?? "").trim();
            const searchable = `${name} ${String(item.sku ?? item.code ?? "")}`.toLowerCase().replace(/[^a-z0-9]+/g, " ");
            const score = queryTerms.filter((term) => searchable.includes(term)).length;
            return { item, score };
          })
          .filter(({ score }) => score === queryTerms.length)
          .sort((a, b) => b.score - a.score)
          .map(({ item }) => item)
        : items;
      return JSON.stringify({
        resource,
        query: opts.q,
        count: relevantItems.length,
        total: resource === "products" && queryTerms.length
          ? relevantItems.length
          : (total ?? items.length),
        items: relevantItems.slice(0, 20),
      });
    }
    const limit = Number(args.limit) || 50;
    const page = await listResource(enterpriseId, resource, { limit });
    return JSON.stringify({
      resource,
      count: page.items.length,
      total: page.total,
      nextCursor: page.nextCursor,
      items: page.items.slice(0, 100),
    });
  } catch (e) {
    return JSON.stringify({ error: `Mercury Store read failed: ${(e as Error).message}` });
  }
}

async function toolStoreGet(enterpriseId: string, args: Record<string, unknown>) {
  const resource = String(args.resource ?? "");
  const id = String(args.id ?? "");
  try {
    const { getResource } = await import("./connections/mercury");
    const item = await getResource(enterpriseId, resource, id);
    return JSON.stringify(item ? { resource, item } : { error: "Not found." });
  } catch (e) {
    return JSON.stringify({ error: `Mercury Store read failed: ${(e as Error).message}` });
  }
}

async function toolCreateQuotation(enterpriseId: string, agentId: string, args: Record<string, unknown>) {
  try {
    const items = Array.isArray(args.items)
      ? (args.items as Record<string, unknown>[]).map((i) => ({
          description: String(i.description ?? ""),
          rate: Number(i.rate) || 0,
          qty: Number(i.qty) || 0,
        }))
      : [];
    if (!items.length) return JSON.stringify({ error: "No line items provided for the quotation." });

    const { createQuotationPdf } = await import("./quotations");
    const q = await createQuotationPdf({
      enterpriseId,
      agentId,
      agentLabel: AGENT_LABEL[agentId] ?? "Agent",
      logo: AGENT_LOGO[agentId],
      client: (args.client as Record<string, string>) ?? {},
      items,
      currency: args.currency as string | undefined,
      vatExempt: Boolean(args.vatExempt),
      preparedBy: args.preparedBy as string | undefined,
      title: args.title as string | undefined,
    });
    return JSON.stringify({
      created: true,
      documentId: q.id,
      proforma_no: q.proforma_no,
      total: q.total,
      currency: q.currency,
      name: q.name,
      url: q.url,
      type: "pdf",
    });
  } catch (e) {
    return JSON.stringify({ error: `Quotation creation failed: ${(e as Error).message}` });
  }
}

async function toolCreateZohoQuotation(
  enterpriseId: string,
  agentId: string,
  args: Record<string, unknown>,
  currentUserMessage: string,
  recentConversation: string,
  callerUid?: string
) {
  const normalizeText = (value: unknown) => String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const customer = (args.customer as Record<string, unknown> | undefined) ?? {};
  const items = Array.isArray(args.items) ? args.items : [];
  let email = String(customer.email ?? "").trim().toLowerCase();
  if (!email) {
    const knownEmails = `${recentConversation}\n${currentUserMessage}`
      .match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
    email = knownEmails?.at(-1)?.trim().toLowerCase() ?? "";
    if (email) customer.email = email;
  }
  const name = String(customer.name ?? "").trim();
  const placeholderName = /^(customer|client|unknown|n\/?a|test|user)$/i.test(name);
  const placeholderEmail = /@(example\.(com|org|net)|test\.com)$/i.test(email) || /^(customer|client|test)@/i.test(email);
  if (!name || placeholderName || !/.+@.+\..+/.test(email) || placeholderEmail) {
    return JSON.stringify({
      needsInput: true,
      missingField: "customer_details",
      question: "What are the customer's full name, company name and email address?",
    });
  }
  if (!items.length) return JSON.stringify({ error: "At least one quotation item is required." });
  const invalidItem = (items as Record<string, unknown>[]).find((item) =>
    !String(item.product ?? item.description ?? "").trim() ||
    !(Number(item.quantity) > 0) ||
    !(Number(item.rate) > 0)
  );
  if (invalidItem) {
    const productName = String(invalidItem.product ?? invalidItem.description ?? "that item").trim();
    return JSON.stringify({
      needsInput: true,
      missingField: "unit_price",
      product: productName,
      question: `What unit price should I use for ${productName}? I won't guess a price.`,
    });
  }
  const normalizedCurrent = normalizeText(currentUserMessage);
  const currentDigits = currentUserMessage.replace(/\D/g, "");
  const normalizedContext = normalizeText(recentConversation);
  const selectedListedOption = /\b(first|second|third|fourth|fifth|option\s*[1-5]|number\s*[1-5])\b/i.test(currentUserMessage);
  const confirmedPriorSuggestion = /\b(?:yes|confirmed?|proceed|go ahead|that exact one|that one|this one)\b/i.test(currentUserMessage);
  const unconfirmedItem = (items as Record<string, unknown>[]).find((item) => {
    const product = String(item.product ?? item.description ?? "").trim();
    const normalizedProduct = normalizeText(product);
    const rate = Number(item.rate);
    const hasSpecificModelDetails = /\b\d+\s*(gb|tb)\b/i.test(product)
      || /\b(?:m[1-9]|iphone\s*\d+|thinkpad\s+[a-z0-9-]+|ideapad\s+[a-z0-9-]+|latitude\s+\d+|probook\s+\d+|elitebook\s+\d+)\b/i.test(product)
      || /\b[A-Z]{1,5}-?\d{2,}[A-Z0-9-]*\b/.test(product);
    const explicitlyNamed = normalizedProduct.length > 0 && normalizedCurrent.includes(normalizedProduct);
    const rateDigits = String(rate).replace(/\D/g, "");
    const suppliedRate = Number.isFinite(rate) && rate > 0 && rateDigits.length > 0 && currentDigits.includes(rateDigits);
    // Some exact catalogue names (for example AirPods) have no model number.
    // A sufficiently descriptive name plus its stated price is still an explicit
    // user confirmation and must not be treated as a broad product request.
    const explicitlyConfirmedCatalogueItem = explicitlyNamed
      && suppliedRate
      && (hasSpecificModelDetails || normalizedProduct.split(" ").length >= 5);
    const selectedFromListedOptions = (selectedListedOption || confirmedPriorSuggestion)
      && normalizedProduct.length > 0
      && normalizedContext.includes(normalizedProduct);
    return !selectedFromListedOptions && !explicitlyConfirmedCatalogueItem;
  });
  if (unconfirmedItem) {
    const requested = String(unconfirmedItem.product ?? unconfirmedItem.description ?? "the requested product").trim();
    return JSON.stringify({
      needsInput: true,
      missingField: "exact_product_confirmation",
      product: requested,
      question: `I found multiple possible products for ${requested}. Which exact model should I quote?`,
    });
  }
  const usdToUgx = 3800;
  const normalizedItems: Record<string, unknown>[] = (items as Record<string, unknown>[]).map((item) => {
    const sourceRate = Number(item.rate);
    const sourceCurrency = String(item.rateCurrency ?? "USD").trim().toUpperCase();
    const includesVat = item.rateIncludesVat !== false;
    const grossUgx = sourceCurrency === "USD"
      ? Math.ceil((sourceRate * usdToUgx) / 1000) * 1000
      : sourceRate;
    const netUgx = includesVat ? grossUgx / 1.18 : grossUgx;
    return {
      ...item,
      rate: netUgx,
      rateCurrency: "UGX",
      rateIncludesVat: false,
      sourceRate,
      sourceCurrency,
      sourceIncludesVat: includesVat,
      convertedGrossUgx: grossUgx,
      exchangeRate: sourceCurrency === "USD" ? usdToUgx : undefined,
    };
  });
  const workflowKey = randomUUID();
  const params: Record<string, unknown> = {
    workflowKey,
    agentId,
    customer: { ...customer, name, email },
    items: normalizedItems,
    currency: "UGX",
    pricing: { usd_to_ugx: usdToUgx, usd_prices_include_vat: true, ugx_rounding: "ceiling_to_1000" },
  };
  const subject = String(args.subject ?? "").trim();
  const quoteDate = String(args.quoteDate ?? "").trim();
  const dealName = String(args.dealName ?? "").trim();
  const currency = "UGX";
  let preparedBy = "";
  if (callerUid) {
    const requester = await db.collection("users").doc(callerUid).get();
    const displayName = String(requester.data()?.display_name ?? "").trim();
    const nameParts = displayName.split(/\s+/).filter(Boolean);
    if (nameParts.length === 1) preparedBy = nameParts[0];
    if (nameParts.length > 1) preparedBy = `${nameParts[0]} ${nameParts[nameParts.length - 1]}`;
  }
  const bankDetails = String(args.bankDetails ?? "").trim();
  const connectionOwnerUid = String(args.connectionOwnerUid ?? "").trim();
  if (subject) params.subject = subject;
  if (quoteDate) params.quoteDate = quoteDate;
  if (dealName) params.dealName = dealName;
  params.currency = currency;
  if (preparedBy) params.preparedBy = preparedBy;
  if (bankDetails) params.bankDetails = bankDetails;
  if (args.vatExempt === true) params.vatExempt = true;
  if (connectionOwnerUid) params.connectionOwnerUid = connectionOwnerUid;
  const { createZohoQuotationWorkflow } = await import("./zohoQuotations");
  let output: { dealId?: string; documentId: string; fileName: string; url: string };
  let crmError: string | null = null;
  try {
    output = await createZohoQuotationWorkflow(enterpriseId, params as any);
  } catch (error) {
    crmError = (error as Error).message;
    const { createQuotationPdf } = await import("./quotations");
    const pdf = await createQuotationPdf({
      enterpriseId,
      agentId,
      agentLabel: AGENT_LABEL[agentId] ?? "Ivy Agent",
      logo: AGENT_LOGO[agentId],
      client: {
        name: String(customer.company ?? name),
        address: String(customer.billingCity ?? ""),
        tin: String(customer.tin ?? ""),
        contact_person: name,
        contact_no: String(customer.phone ?? ""),
        email,
      },
      items: normalizedItems.map((item) => ({
        description: String(item["description"] ?? item["product"] ?? ""),
        qty: Math.max(1, Number(item["quantity"]) || 1),
        rate: Number(item.rate),
      })),
      currency: currency || "UGX",
      vatExempt: args.vatExempt === true,
      preparedBy,
      date: quoteDate,
      title: subject || `Quotation for ${String(customer.company ?? name)}`,
      bankDetails,
      source: { system: "ellipse_quotation", workflow_key: workflowKey, crm_error: crmError },
    });
    output = { documentId: pdf.id, fileName: pdf.name, url: pdf.url };
  }
  const audit = await db.collection("pending_actions").add({
    enterprise_id: enterpriseId,
    agent_id: `${agentId}-agent`,
    domain: "assistant",
    action_type: "create_quotation_workflow",
    params,
    target_system: "zoho",
    status: "executed",
    approval_required: false,
    crm_status: crmError ? "error" : "captured",
    crm_error: crmError,
    action_summary: `Created a fresh Deal and quotation PDF for ${name} <${email}>.`,
    external_ref: JSON.stringify(output),
    created_at: FieldValue.serverTimestamp(),
    executed_at: FieldValue.serverTimestamp(),
  });
  return JSON.stringify({
    action: "create_zoho_quotation",
    workflowKey,
    status: "executed",
    auditActionId: audit.id,
    ...output,
    name: output.fileName,
    type: "pdf",
    crmStatus: crmError ? "error" : "captured",
    crmError,
  });
}

async function toolFindZohoQuotation(enterpriseId: string, args: Record<string, unknown>) {
  const email = String(args.email ?? "").trim().toLowerCase();
  const quoteId = String(args.quoteId ?? "").trim();
  const snap = await db.collection("documents").where("enterprise_id", "==", enterpriseId).get();
  const rows = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as any))
    .filter((doc) =>
      (doc.source?.system === "zoho" && doc.source?.module === "Quotes") ||
      doc.source?.system === "zoho_ellipse_hybrid"
    )
    .filter((doc) => !email || String(doc.customer?.email ?? "").toLowerCase() === email)
    .filter((doc) => !quoteId || doc.source?.quote_id === quoteId || doc.source?.deal_id === quoteId)
    .sort((a, b) => (b.created_at?.toMillis?.() ?? 0) - (a.created_at?.toMillis?.() ?? 0))
    .slice(0, 5)
    .map((doc) => ({
      documentId: doc.id,
      name: doc.file?.name,
      quoteId: doc.source?.quote_id,
      dealId: doc.source?.deal_id,
      customer: doc.customer,
      createdAt: doc.created_at?.toDate?.()?.toISOString?.(),
    }));
  return JSON.stringify({ found: rows.length > 0, quotations: rows });
}

async function toolGetZohoQuote(enterpriseId: string, args: Record<string, unknown>) {
  try {
    const { getQuoteForQuotation } = await import("./connections/zoho");
    const quote = await getQuoteForQuotation(enterpriseId, {
      proforma: (args.proforma as string | undefined)?.trim(),
      subject: (args.subject as string | undefined)?.trim(),
      account: (args.account as string | undefined)?.trim(),
    });
    if (!quote) return JSON.stringify({ found: false, message: "No matching Zoho quote found." });
    return JSON.stringify({ found: true, quote });
  } catch (e) {
    return JSON.stringify({ error: `Zoho quote lookup failed: ${(e as Error).message}` });
  }
}

async function toolGetActionStatus(enterpriseId: string, args: Record<string, unknown>) {
  const actionId = String(args.actionId ?? "").trim();
  if (!actionId) return JSON.stringify({ error: "An actionId is required." });
  const snap = await db.doc(`pending_actions/${actionId}`).get();
  const action = snap.data();
  if (!snap.exists || action?.enterprise_id !== enterpriseId) return JSON.stringify({ error: "Action not found." });

  let output: Record<string, unknown> | null = null;
  if (typeof action.external_ref === "string" && action.external_ref.trim().startsWith("{")) {
    try { output = JSON.parse(action.external_ref) as Record<string, unknown>; } catch { /* external id, not JSON */ }
  }
  const documentId = typeof output?.documentId === "string" ? output.documentId : undefined;
  let file: { documentId: string; name: string; url: string; type: string } | null = null;
  if (documentId) {
    const document = (await db.doc(`documents/${documentId}`).get()).data();
    if (document?.enterprise_id === enterpriseId && document?.file?.url) {
      file = { documentId, name: document.file.name, url: document.file.url, type: document.file.type || "pdf" };
    }
  }
  return JSON.stringify({
    actionId,
    action: action.action_type,
    status: action.status,
    error: action.error ?? null,
    output,
    file,
    attachment: action.params?.attachment ?? null,
  });
}

async function toolSendEmail(
  enterpriseId: string,
  agentId: string,
  args: Record<string, unknown>,
  callerUid?: string,
  requiresAttachment = false
) {
  const to = String(args.to ?? "").trim();
  const subject = String(args.subject ?? "").trim();
  const body = String(args.body ?? "").trim();
  const cc = (args.cc as string | undefined)?.trim() || undefined;
  const attachDocumentId = (args.attachDocumentId as string | undefined)?.trim();
  if (!to || !/.+@.+\..+/.test(to)) return JSON.stringify({ error: "A valid recipient email address is required." });
  if (!subject && !body) return JSON.stringify({ error: "Provide a subject and body for the email." });
  if (requiresAttachment && !attachDocumentId) {
    return JSON.stringify({
      error: "This request is to share a quotation/document, but no stored documentId was supplied. The email was not queued. Check the earlier action status first and attach its real documentId.",
    });
  }

  // Pick a connected email channel: Gmail → Microsoft 365 → SMTP.
  const connSnap = await db.collection("connections").where("enterprise_id", "==", enterpriseId).get();
  const available = connSnap.docs.map((d) => d.data()).filter((d) => d.status === "active" && (d.scope !== "personal" || d.owner_uid === callerUid));
  const active = new Set(available.map((d) => d.type as string));
  const personalGoogle = available.find((d) => d.type === "google-workspace" && d.scope === "personal" && d.owner_uid === callerUid);
  let targetSystem: "gmail" | "microsoft365" | "smtp" | null = null;
  if (active.has("google-workspace")) targetSystem = "gmail";
  else if (active.has("microsoft365")) targetSystem = "microsoft365";
  else if (active.has("smtp")) targetSystem = "smtp";
  if (!targetSystem) return JSON.stringify({ error: "No email channel is connected (need Gmail, Microsoft 365, or SMTP)." });

  // Resolve an attachment from a previously created document, if requested.
  let attachment: { storagePath: string; fileName: string; contentType: string } | undefined;
  let attachedName: string | undefined;
  if (attachDocumentId) {
    const docSnap = await db.doc(`documents/${attachDocumentId}`).get();
    const d = docSnap.data();
    if (!docSnap.exists || d?.enterprise_id !== enterpriseId) {
      return JSON.stringify({ error: "Attachment document not found." });
    }
    const path = d?.storage_path as string | undefined;
    const file = d?.file as { name?: string } | undefined;
    if (!path) return JSON.stringify({ error: "That document can't be attached (missing stored file)." });
    attachment = {
      storagePath: path,
      fileName: file?.name || "attachment",
      contentType: (d?.content_type as string) || "application/octet-stream",
    };
    attachedName = attachment.fileName;
  }

  const res = await executeAgentAction({
    enterpriseId,
    agentId: `${agentId}-agent`,
    domain: "assistant",
    actionType: "send_email",
    params: { to, subject, body, cc, attachment, connectionOwnerUid: targetSystem === "gmail" && personalGoogle ? callerUid : undefined },
    targetSystem,
    reasoning: `Email "${subject}" to ${to}${attachedName ? ` with attachment ${attachedName}` : ""} (requested in chat).`,
  });
  return JSON.stringify({ action: "send_email", to, attached: attachedName ?? null, channel: targetSystem, ...res });
}

async function toolStoreWrite(enterpriseId: string, actionType: "create_record" | "update_record", args: Record<string, unknown>) {
  const resource = String(args.resource ?? "");
  const fields = (args.fields as Record<string, unknown>) ?? {};
  const id = args.id as string | undefined;
  if (!resource) return JSON.stringify({ error: "Missing resource." });
  const verb = actionType === "create_record" ? "Create" : "Update";
  const res = await executeAgentAction({
    enterpriseId,
    agentId: "mercury-agent",
    domain: "assistant",
    actionType,
    params: { resource, id, fields },
    targetSystem: "mercury",
    reasoning: `${verb} ${resource.replace(/s$/, "")}${id ? ` ${id}` : ""} in the Mercury Store (requested in chat).`,
  });
  return JSON.stringify({ action: actionType, resource, ...res });
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

async function toolSearchConversations(enterpriseId: string, agentId: string, args: Record<string, unknown>, allowedConnections: Set<string>, callerUid?: string) {
  const channel = (args.channel as string) || (agentId !== "ivy" && agentId !== "zoho" ? agentId : undefined);
  const limit = Math.min(Number(args.limit) || 8, 20);
  const snap = await db.collection("conversations").where("enterprise_id", "==", enterpriseId).get();
  const rows = snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }))
    .filter((c) => (channel ? c.channel === channel : true))
    .filter((c) => allowedConnections.has(c.channel as string))
    .filter((c) => c.connection_scope === "personal" ? c.owner_uid === callerUid : true)
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

async function toolGetReports(enterpriseId: string, args: Record<string, unknown>, callerUid?: string) {
  const period = args.period as string | undefined;
  const limit = Math.min(Number(args.limit) || 6, 12);
  const snap = await db.collection("reports").where("enterprise_id", "==", enterpriseId).get();
  const caller = callerUid ? (await db.doc(`users/${callerUid}`).get()).data() : undefined;
  const manager = caller?.role === "owner" || caller?.role === "admin";
  const rows = snap.docs
    .map((d) => d.data() as Record<string, unknown>)
    .filter((r) => !callerUid || manager || r.created_by_uid === callerUid || r.owner_uid === callerUid)
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

async function toolListLeads(enterpriseId: string, args: Record<string, unknown>) {
  const connSnap = await db.doc(`connections/${enterpriseId}_zoho`).get();
  if (!connSnap.exists || connSnap.data()?.status !== "active") {
    return JSON.stringify({ connected: false, note: "Zoho CRM is not connected for this workspace." });
  }
  try {
    const { getLeadsList } = await import("./connections/zoho");
    const days = args.days ? Number(args.days) : undefined; // only filter by period if asked
    const limit = Number(args.limit) || 25;
    const leads = await getLeadsList(enterpriseId, { days, limit });
    return JSON.stringify({
      connected: true,
      window_days: days ?? "all",
      count: leads.length,
      note:
        leads.length === 0
          ? days
            ? `No leads were created in the last ${days} days.`
            : "No leads found in Zoho."
          : undefined,
      leads,
    });
  } catch (e) {
    return JSON.stringify({ connected: true, error: `Zoho leads read failed: ${(e as Error).message}` });
  }
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
    params: { module: "Leads", fields, connectionOwnerUid: args.connectionOwnerUid },
    targetSystem: "zoho",
    reasoning: `Create Zoho lead ${name} <${email}> (requested in chat).`,
  });
  return JSON.stringify({ action: "create_crm_lead", ...res });
}

async function toolReply(enterpriseId: string, args: Record<string, unknown>, callerUid?: string) {
  const conversationId = String(args.conversationId ?? "");
  const body = String(args.body ?? "");
  if (!conversationId || !body) return "Missing conversationId or body.";
  const conv = await db.doc(`conversations/${conversationId}`).get();
  if (!conv.exists) return "Conversation not found.";
  const c = conv.data() as Record<string, unknown>;
  if (c.connection_scope === "personal" && c.owner_uid !== callerUid) return "You do not have access to this personal conversation.";
  const channel = c.channel as string;
  const target = CHANNEL_TARGET[channel];
  if (!target) return `Cannot reply on channel ${channel}.`;
  const attachDocumentId = String(args.attachDocumentId ?? "").trim();
  let attachment: { storagePath: string; fileName: string; contentType: string } | undefined;
  if (attachDocumentId) {
    const document = await db.doc(`documents/${attachDocumentId}`).get();
    const d = document.data();
    if (!document.exists || d?.enterprise_id !== enterpriseId || !d?.storage_path) return "Attachment document not found.";
    attachment = { storagePath: d.storage_path, fileName: d.file?.name || "quotation.pdf", contentType: d.content_type || "application/pdf" };
  }
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
      attachment,
      connectionOwnerUid: c.connection_scope === "personal" ? c.owner_uid : undefined,
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
  mercury: "Mercury Store (products, orders, quotations, repairs)",
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
  } else if (agentId === "mercury") {
    scope = `\nYou are the Mercury Store specialist: products, orders, quotations and repairs. Read and act on store data via your tools; writes go through approval. Defer non-store questions.`;
  } else {
    scope = `\nYou are the ${label.replace(" Agent", "")} channel specialist: its conversations and replies. You know this channel deeply and defer questions about other channels.`;
  }

  const storeRule = connected.has("mercury")
    ? `\n\nMERCURY STORE DATA: For any question about store products, orders, quotations or repairs (does it exist, is it available, how many, details, status), you MUST call store_list (or store_get) FIRST and answer only from what it returns. Never say there are none / it doesn't exist / it's unavailable unless a tool result confirms zero. For product lookups always use the \`q\` search parameter.`
    : "";

  const quotationRule = connected.has("zoho")
    ? `\n\nOFFICIAL QUOTATION RULE: For a broad product request, search the Mercury catalogue and present matching exact models with their USD prices, then WAIT for the user to select one. Never select, recommend, substitute or create a quotation from search results on the user's behalf. Only after the user explicitly selects or names one exact model may you use create_zoho_quotation. It immediately captures or reuses the Lead, Account and Contact, creates a FRESH Deal, creates a fresh PDF using Ellipse's fixed template, saves it to Data and returns it in chat; it does not wait for approval. Require a real customer name, valid email, company/account name, exact product description, quantity and unit price. Mercury catalogue prices are USD and already include 18% VAT: pass that USD number as rate with rateCurrency:'USD' and rateIncludesVat:true. The backend converts at USD 1 = UGX 3,800, rounds the VAT-inclusive UGX unit price UP to the next 1,000, removes 18% for the line rate, and adds 18% back in the quotation totals. Never do that arithmetic yourself and never guess a price. Also collect phone, location and TIN when available, but do not invent them. Prepared By is always derived from the signed-in user. Every completed quotation is written as an executed audit record. When the tool returns executed with a real documentId, the file is ready to share.`
    : "";

  const connectedNames = [...connected].map((t) => CONNECTION_LABEL[t]).filter(Boolean);
  const connLine = connectedNames.length
    ? `\n\nConnected integrations for this workspace: ${connectedNames.join(", ")}. When asking the user to choose a source/channel for a report or action, ONLY offer options from THIS list. NEVER offer or mention an integration that isn't in this list (e.g. don't suggest WhatsApp if it's not connected). Reports/exports as downloadable files are currently available for Zoho CRM only — if the user wants another source, answer from its data but say a file export isn't available for it yet.`
    : `\n\nNo integrations are connected yet — tell the user to connect one before you can pull data.`;

  const knowledge = kb ? `\n\n--- Company knowledge base (authoritative facts) ---\n${kb}` : "";
  return base + scope + connLine + storeRule + quotationRule + knowledge;
}

function renderHistory(history: ChatTurn[]): string {
  return history
    .slice(-10)
    .map((t) => {
      const actionState = t.actions?.length
        ? `\nVerified action state: ${t.actions.map((action) => `${action.name}=${String(action.result ?? "").slice(0, 1200)}`).join("; ")}`
        : "";
      return `${t.role === "user" ? "User" : "Assistant"}: ${t.text}${actionState}`;
    })
    .join("\n");
}

function renderDurableChatFacts(history: ChatTurn[]): string {
  const emails = [...new Set(
    history.flatMap((turn) => turn.text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])
      .map((email) => email.toLowerCase())
  )].slice(-5);
  let latestCustomer: Record<string, unknown> | undefined;
  let latestDocument: { documentId?: string; fileName?: string } | undefined;
  for (const turn of history) {
    for (const action of turn.actions ?? []) {
      if (action.name === "create_zoho_quotation") {
        const customer = action.args?.customer;
        if (customer && typeof customer === "object") latestCustomer = customer as Record<string, unknown>;
        const result = parseToolResult(action.result ?? "");
        if (result?.documentId) latestDocument = {
          documentId: String(result.documentId),
          fileName: result.fileName ? String(result.fileName) : undefined,
        };
      }
    }
  }
  const facts = [
    emails.length ? `Known email addresses: ${emails.join(", ")}.` : "",
    latestCustomer ? `Latest quotation customer: ${JSON.stringify(latestCustomer)}.` : "",
    latestDocument ? `Latest created quotation document: ${JSON.stringify(latestDocument)}.` : "",
  ].filter(Boolean);
  return facts.length ? `Durable facts extracted from the full chat:\n${facts.join("\n")}` : "";
}

const MUTATING_TOOLS = new Set([
  "create_crm_lead", "reply_to_conversation", "create_document", "generate_report",
  "generate_owner_analysis", "store_create", "store_update", "create_quotation",
  "create_zoho_quotation", "send_email",
]);

function parseToolResult(result: string): Record<string, any> | null {
  try { return JSON.parse(result) as Record<string, any>; } catch { return null; }
}

function deterministicActionReply(actions: ChatAction[], files: { name: string; url: string; type: string }[], fallback: string): string {
  if (!actions.length) {
    if (/\b(queued|created|generated|sent|saved|submitted (?:it )?for approval)\b/i.test(fallback)) {
      return "I verified the available data, but no creation, approval, or send action was actually recorded. Nothing was queued or sent.";
    }
    return fallback;
  }
  const lines: string[] = [];
  for (const action of actions) {
    const data = parseToolResult(action.result ?? "");
    if (!data) { lines.push(`${action.name} returned an unreadable result and was not confirmed.`); continue; }
    if (data.error) { lines.push(String(data.error)); continue; }
    if (action.name === "create_quotation" && data.created) {
      lines.push(`Created ${data.name || "the quotation PDF"} and saved it to Data.`);
    } else if (action.name === "create_zoho_quotation") {
      if (data.status === "pending") lines.push(`CRM capture and quotation creation are pending approval (action ${data.pendingActionId}). The PDF does not exist yet.`);
      else if (data.status === "executed") lines.push("The quotation was created and saved to Data.");
      else lines.push(`CRM capture and quotation creation were not completed${data.reason ? `: ${data.reason}` : "."}`);
    } else if (action.name === "send_email") {
      const attachment = data.attached ? ` with ${data.attached} attached` : " without an attachment";
      if (data.status === "pending") lines.push(`Email to ${data.to} is pending approval${attachment} (action ${data.pendingActionId}).`);
      else if (data.status === "executed") lines.push(`Email sent to ${data.to}${attachment}.`);
      else lines.push(`Email to ${data.to} was not queued or sent${data.reason ? `: ${data.reason}` : "."}`);
    } else if (data.status === "pending") {
      lines.push(`${action.name.replace(/_/g, " ")} is pending approval (action ${data.pendingActionId}).`);
    } else if (data.status === "executed" || data.created || data.saved) {
      lines.push(`${action.name.replace(/_/g, " ")} completed successfully.`);
    }
  }
  if (files.length && !lines.some((line) => /Created .*saved it to Data/.test(line))) lines.push(`${files.length} verified file${files.length === 1 ? " is" : "s are"} available below.`);
  return [...new Set(lines.filter(Boolean))].join(" ") || fallback;
}

function quotationProductSearchQuery(message: string, history: ChatTurn[]): string | null {
  const quotationRequest = /\b(quotation|quote|proforma)\b/i.test(message);
  const awaitingProduct = history.slice(-2).some((turn) =>
    turn.role === "ivy" && /\b(which exact model|exact model|model name\/code)\b/i.test(turn.text)
  );
  if (!quotationRequest && !awaitingProduct) return null;
  if (!/\b(laptop|computer|macbook|iphone|phone|desktop|monitor|printer|tablet|server)\b/i.test(message)) return null;

  // A list of explicitly priced products is already a selection, not one broad
  // product query. Let the agent create one quotation with all supplied lines.
  const pricedItems = message.match(/(?:USD\s*|\$)\s*\d[\d,]*(?:\.\d+)?/gi) ?? [];
  if (pricedItems.length >= 2) return null;

  // When the user copies an exact model from Ivy's immediately preceding
  // catalogue options, that is the selection. Do not turn it into another
  // broad catalogue search merely because the model family contains words.
  const selectedText = message
    .replace(/^\s*(?:yes[, ]+)?(?:that|this|the)\s+(?:one|model)[,.:;-]*\s*/i, "")
    .replace(/\s*[-–—]?\s*(?:USD\s*|\$)\s*[\d,.]+\s*$/i, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const copiedFromOptions = selectedText.split(" ").filter(Boolean).length >= 5
    && history.slice(-4).some((turn) => turn.role === "ivy"
      && turn.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").includes(selectedText));
  if (copiedFromOptions) return null;

  const hasExactModel =
    /\bmacbook\s+(?:air|pro)\b[^\n]{0,70}\bm[1-9]\b[^\n]{0,70}\b\d+\s*gb\b/i.test(message) ||
    /\biphone\s+\d{2}\b/i.test(message) ||
    /\bgalaxy\s+[a-z]\d{2}\b/i.test(message) ||
    /\b(?:thinkpad|ideapad|yoga|legion|loq)\s+[a-z0-9][a-z0-9-]{1,}\b/i.test(message) ||
    /\b(?:elitebook|probook|pavilion|omen)\s+\d{3,}\b/i.test(message) ||
    /\b(?:latitude|inspiron|vostro|precision|xps)\s+\d{3,}\b/i.test(message) ||
    /\b[A-Z]{2,6}-?\d{3,}[A-Z0-9-]*\b/.test(message);
  if (hasExactModel) return null;

  const productPhrase = quotationRequest
    ? message.match(/\b(?:for|of)\s+(.+?)(?:\s+for\s+\d+|\s+for\s+[A-Z]|[,.]|$)/i)?.[1]?.trim()
    : message.trim();
  return (productPhrase || message)
    .replace(/^(?:the|a|an)\s+/i, "")
    .replace(/\b(?:please|pls)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function chatWithAgent(
  enterpriseId: string,
  agentId: string,
  message: string,
  history: ChatTurn[] = [],
  callerUid?: string
): Promise<{ reply: string; actions: unknown[]; files: { name: string; url: string; type: string }[] }> {
  const productSearchQuery = quotationProductSearchQuery(message, history);

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
  const activeConns = connSnap.docs
    .map((d) => d.data())
    .filter((c) => c.status === "active")
    .map((c) => ({ type: c.type as string, scope: c.scope as string | undefined, owner_uid: c.owner_uid as string | undefined }));

  // Per-user access: owner/admin (or granted employees) get all shared connections;
  // ungranted employees only get their own personal connections.
  const { allowedConnectionTypes } = await import("./access");
  const connected = await allowedConnectionTypes(enterpriseId, callerUid, activeConns);
  const personalZohoOwnerUid = callerUid && activeConns.some((c) => c.type === "zoho" && c.scope === "personal" && c.owner_uid === callerUid)
    ? callerUid
    : undefined;

  // Do not rely on the UI hiding an agent. A caller may invoke askAgent with
  // any agentId directly, so enforce shared/personal connection access here.
  const requiredConnection = AGENT_CONNECTION[agentId];
  if (requiredConnection && !connected.has(requiredConnection)) {
    return {
      reply: "You do not have access to this organization connection. Request access from an owner or admin first.",
      actions: [],
      files: [],
    };
  }

  if (productSearchQuery) {
    if (!connected.has("mercury")) {
      return {
        reply: `Which exact ${productSearchQuery} model should I quote? Please provide the model/code, RAM, storage and screen size.`,
        actions: [],
        files: [],
      };
    }
    try {
      const { listAllResource } = await import("./connections/mercury");
      const { items } = await listAllResource(enterpriseId, "products", { q: productSearchQuery }, 1000);
      const queryTerms = productSearchQuery.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ")
        .filter((term) => term.length > 1 && !["laptop", "computer", "the", "with"].includes(term));
      const matches = items
        .map((item: any) => {
          const name = String(item.name ?? item.productName ?? item.title ?? "").trim();
          const normalizedName = name.toLowerCase().replace(/[^a-z0-9]+/g, " ");
          const score = queryTerms.filter((term) => normalizedName.includes(term)).length;
          return { item, name, score };
        })
        .filter((match: any) => match.name && match.score === queryTerms.length)
        .sort((a: any, b: any) => b.score - a.score || a.name.localeCompare(b.name))
        .slice(0, 5);
      if (!matches.length) {
        return {
          reply: `I couldn't find an exact catalogue match for ${productSearchQuery}. Please provide the precise model/code and specifications; I won't substitute another product.`,
          actions: [],
          files: [],
        };
      }
      const options = matches.map((match: any, index: number) => {
        const usd = Number(match.item.priceUsd);
        const price = usd > 0
          ? ` - USD ${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (VAT included)`
          : "";
        return `${index + 1}. ${match.name}${price}`;
      });
      return {
        reply: `I found these matching models:\n\n${options.join("\n")}\n\nWhich exact model should I use? I will wait for your selection and won't choose one automatically.`,
        actions: [],
        files: [],
      };
    } catch {
      return {
        reply: `I couldn't search the product catalogue right now. Please provide the exact ${productSearchQuery} model/code and specifications; I won't choose a substitute.`,
        actions: [],
        files: [],
      };
    }
  }

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
  const durableFacts = renderDurableChatFacts(history);
  const prompt = [durableFacts, convo ? `Conversation so far:\n${convo}\n` : "", `User: ${message}`].filter(Boolean).join("\n");

  const attachmentIntentText = [...history.slice(-4).map((turn) => turn.text), message].join(" ").toLowerCase();
  const requiresEmailAttachment = /\b(pdf|document|quotation|quote|attachment)\b/.test(attachmentIntentText)
    && /\b(share|email|send|attach)\b/.test(attachmentIntentText);

  // A bounded agent loop supports lookup → create → share chains while preventing
  // unbounded retries. Every round receives authoritative results from earlier rounds.
  let response = await callGemini({ system, prompt, tools, temperature: 0.1 });
  let finalText = response.text || "";
  const results: string[] = [];
  const actions: ChatAction[] = [];
  const files: { name: string; url: string; type: string }[] = [];
  const seenCalls = new Set<string>();
  const attemptedMutations = new Set<string>();
  for (let round = 0; round < 5 && response.functionCalls.length; round++) {
    for (const call of response.functionCalls) {
      const signature = `${call.name}:${JSON.stringify(call.args)}`;
      let out: string;
      const repeatedMutation = MUTATING_TOOLS.has(call.name) && attemptedMutations.has(call.name);
      if (seenCalls.has(signature) || repeatedMutation) {
        out = JSON.stringify({ error: "That action was already attempted in this request. It was not attempted again." });
      } else {
        seenCalls.add(signature);
        try {
          out = await runTool(enterpriseId, agentId, call.name, call.args, isOwner, connected, callerUid, personalZohoOwnerUid, requiresEmailAttachment, message, [durableFacts, convo].filter(Boolean).join("\n"));
        } catch (e) {
          logger.error("chat tool failed", { enterpriseId, agentId, tool: call.name, error: (e as Error).message });
          out = JSON.stringify({ error: `The ${call.name.replace(/_/g, " ")} action could not be completed. Nothing was queued or sent.` });
        }
      }
      logger.info("tool result", { agentId, tool: call.name, enterpriseId, out: out.slice(0, 500) });
      results.push(`${call.name} → ${out}`);
      const parsedToolOutput = parseToolResult(out);
      // A clarification response did not mutate anything. Allow the model to
      // make one corrected call with newly resolved product details in this
      // request, while seenCalls still blocks an identical retry loop.
      if (MUTATING_TOOLS.has(call.name) && !repeatedMutation && !parsedToolOutput?.needsInput && !parsedToolOutput?.error) {
        attemptedMutations.add(call.name);
      }
      if (MUTATING_TOOLS.has(call.name) && !repeatedMutation && !parsedToolOutput?.needsInput && !parsedToolOutput?.error) {
        actions.push({ name: call.name, args: call.args, result: out });
      }
      if (["create_document", "generate_report", "generate_owner_analysis", "create_quotation", "get_action_status", "create_zoho_quotation"].includes(call.name)) {
        try {
          const parsed = JSON.parse(out) as { name?: string; url?: string; file?: { name?: string; url?: string; type?: string }; files?: { name: string; url: string; type?: string }[]; externalRef?: string };
          if (Array.isArray(parsed.files)) {
            for (const f of parsed.files) {
              if (f.url && f.name) files.push({ name: f.name, url: f.url, type: f.type || f.name.split(".").pop() || "file" });
            }
          } else if (parsed.file?.url && parsed.file?.name) {
            files.push({ name: parsed.file.name, url: parsed.file.url, type: parsed.file.type || "file" });
          } else if (parsed.url && parsed.name) {
            files.push({ name: parsed.name, url: parsed.url, type: parsed.name.split(".").pop() || "file" });
          } else if (parsed.externalRef?.startsWith("{")) {
            const external = JSON.parse(parsed.externalRef) as { fileName?: string; url?: string };
            if (external.fileName && external.url) files.push({ name: external.fileName, url: external.url, type: "pdf" });
          }
        } catch {
          /* ignore */
        }
      }
    }
    const continuationPrompt = [
      prompt,
      "", "Verified tool progress (authoritative):", ...results,
      "", "Continue the original request. If another tool is required, call it now using the verified IDs/data above.",
      "Never repeat an identical tool call. Never claim queued, created, generated, saved, attached, approved, or sent unless a tool result explicitly confirms it.",
      requiresEmailAttachment ? "This request involves sharing a file: do not call send_email until a real documentId is available, and pass it as attachDocumentId." : "",
      "If the task is complete or cannot proceed, return the final concise answer.",
    ].filter(Boolean).join("\n");
    response = await callGemini({ system, prompt: continuationPrompt, tools, temperature: 0.05 });
    finalText = response.text || finalText;
  }

  if (!results.length) return { reply: finalText || "…", actions, files };

  // Final wording for read-only results. Mutation claims are rendered from
  // structured results below, not trusted to the language model.
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
  const modelReply = second.text || finalText || "Done.";
  const reply = deterministicActionReply(actions, files, modelReply);
  logger.info("agent chat", { enterpriseId, agentId, toolCalls: results.length, actionCount: actions.length });
  return { reply, actions, files };
}
