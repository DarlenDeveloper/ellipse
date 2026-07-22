import * as logger from "firebase-functions/logger";
import { db, FieldValue } from "./admin";
import { callGemini } from "./gemini";
import { generateReportFiles, LeadRow } from "./reportFiles";

/**
 * Agent reports.
 *
 * Every connected agent produces a periodic summary of what happened on its
 * channel: a daily report at local midnight, a weekly report on Monday, plus
 * monthly / quarterly / annual roll-ups on the first day of each period.
 *
 * A single hourly scheduled function checks each enterprise's local time (from
 * its `timezone`) and generates whatever is due. Reports land in the `reports`
 * collection and surface on the Data page. Doc IDs are deterministic per
 * (enterprise, agent, period, period_key) so re-runs are idempotent.
 */

export type Period = "daily" | "weekly" | "monthly" | "quarterly" | "annual";

type AgentMeta = { agent: string; label: string; logo: string; kind: "messaging" | "crm" | "web" };

// connections/{eid}_{type}.type  →  reporting agent
const AGENT_BY_CONNECTION: Record<string, AgentMeta> = {
  "google-workspace": { agent: "google-workspace", label: "Gmail", logo: "/logos/gmail.png", kind: "messaging" },
  smtp: { agent: "smtp", label: "SMTP", logo: "/logos/smtp.png", kind: "messaging" },
  microsoft365: { agent: "microsoft365", label: "Microsoft 365", logo: "/logos/microsoft.png", kind: "messaging" },
  whatsapp: { agent: "whatsapp", label: "WhatsApp", logo: "/logos/whatsapp.png", kind: "messaging" },
  zoho: { agent: "zoho", label: "Zoho CRM", logo: "/logos/zoho.png", kind: "crm" },
  website: { agent: "website", label: "Website", logo: "", kind: "web" },
};

// channel string stored on messages, per messaging agent
const CHANNEL_BY_AGENT: Record<string, string> = {
  "google-workspace": "google-workspace",
  smtp: "smtp",
  microsoft365: "microsoft365",
  whatsapp: "whatsapp",
};

// ---------------------------------------------------------------------------
// Timezone helpers (no external deps)
// ---------------------------------------------------------------------------

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: string };

function getLocalParts(date: Date, timeZone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === "24" ? "0" : map.hour),
    minute: Number(map.minute),
    weekday: map.weekday,
  };
}

/** UTC instant for a given wall-clock time in a timezone. */
function zonedTimeToUtc(y: number, m: number, d: number, h: number, min: number, timeZone: string): Date {
  const utcGuess = Date.UTC(y, m - 1, d, h, min);
  const p = getLocalParts(new Date(utcGuess), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const offset = asUtc - utcGuess;
  return new Date(utcGuess - offset);
}

/** Local midnight `delta` days from a base local-midnight instant (DST-safe via noon anchor). */
function localMidnightShift(baseUtcMidnight: Date, timeZone: string, delta: number): Date {
  const anchor = new Date(baseUtcMidnight.getTime() + delta * 86400000 + 43200000);
  const p = getLocalParts(anchor, timeZone);
  return zonedTimeToUtc(p.year, p.month, p.day, 0, 0, timeZone);
}

export type Window = { start: Date; end: Date; key: string; label: string };

/** The completed period window ending at the given local-midnight instant. */
function windowFor(period: Period, todayStart: Date, timeZone: string): Window {
  const end = todayStart;
  if (period === "daily") {
    const start = localMidnightShift(todayStart, timeZone, -1);
    const p = getLocalParts(new Date(start.getTime() + 43200000), timeZone);
    const key = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
    return { start, end, key, label: monthDay(p) };
  }
  if (period === "weekly") {
    const start = localMidnightShift(todayStart, timeZone, -7);
    const p = getLocalParts(new Date(start.getTime() + 43200000), timeZone);
    const key = `W${p.year}-${pad(p.month)}-${pad(p.day)}`;
    return { start, end, key, label: `week of ${monthDay(p)}` };
  }
  if (period === "monthly") {
    const prev = getLocalParts(new Date(todayStart.getTime() - 43200000), timeZone); // last day of prev month
    const start = zonedTimeToUtc(prev.year, prev.month, 1, 0, 0, timeZone);
    return { start, end, key: `${prev.year}-${pad(prev.month)}`, label: `${MONTHS[prev.month - 1]} ${prev.year}` };
  }
  if (period === "quarterly") {
    const cur = getLocalParts(todayStart, timeZone); // first day of current quarter
    let m = cur.month - 3;
    let y = cur.year;
    if (m <= 0) {
      m += 12;
      y -= 1;
    }
    const start = zonedTimeToUtc(y, m, 1, 0, 0, timeZone);
    const q = Math.floor((m - 1) / 3) + 1;
    return { start, end, key: `${y}-Q${q}`, label: `Q${q} ${y}` };
  }
  // annual
  const cur = getLocalParts(todayStart, timeZone);
  const start = zonedTimeToUtc(cur.year - 1, 1, 1, 0, 0, timeZone);
  return { start, end, key: `${cur.year - 1}`, label: `${cur.year - 1}` };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const monthDay = (p: LocalParts) => `${MONTHS[p.month - 1]} ${p.day}, ${p.year}`;

/** Which periods roll over at the given local midnight? */
function duePeriods(todayStart: Date, timeZone: string): Period[] {
  const p = getLocalParts(todayStart, timeZone);
  const periods: Period[] = ["daily"];
  if (p.weekday === "Mon") periods.push("weekly");
  if (p.day === 1) {
    periods.push("monthly");
    if ([1, 4, 7, 10].includes(p.month)) periods.push("quarterly");
    if (p.month === 1) periods.push("annual");
  }
  return periods;
}

// ---------------------------------------------------------------------------
// Data gathering + summary
// ---------------------------------------------------------------------------

type Metrics = Record<string, number>;

async function gatherMessaging(enterpriseId: string, channel: string, w: Window) {
  const snap = await db.collection("messages").where("enterprise_id", "==", enterpriseId).get();
  const inWindow = snap.docs
    .map((d) => d.data() as Record<string, unknown>)
    .filter((m) => m.channel === channel)
    .filter((m) => {
      const t = (m.timestamp as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0;
      return t >= w.start.getTime() && t < w.end.getTime();
    });

  const inbound = inWindow.filter((m) => m.sender_type === "customer");
  const outbound = inWindow.filter((m) => m.sender_type !== "customer");
  const conversations = new Set(inWindow.map((m) => m.conversation_id as string));
  const subjects = inbound
    .map((m) => (m.subject as string) || (m.snippet as string) || "")
    .filter(Boolean)
    .slice(0, 15);

  const metrics: Metrics = {
    inbound: inbound.length,
    replies: outbound.length,
    conversations: conversations.size,
  };
  return { metrics, samples: subjects };
}

async function gatherActions(enterpriseId: string, agentId: string, w: Window) {
  const snap = await db.collection("pending_actions").where("enterprise_id", "==", enterpriseId).get();
  const rows = snap.docs
    .map((d) => d.data() as Record<string, unknown>)
    .filter((a) => a.agent_id === agentId || a.target_system === agentId)
    .filter((a) => {
      const t = (a.created_at as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0;
      return t >= w.start.getTime() && t < w.end.getTime();
    });
  return {
    proposed: rows.length,
    executed: rows.filter((a) => a.status === "executed").length,
    approved: rows.filter((a) => a.status === "approved" || a.status === "executed").length,
  };
}

async function gatherLeads(enterpriseId: string, w: Window, channel?: string): Promise<LeadRow[]> {
  const snap = await db.collection("conversations").where("enterprise_id", "==", enterpriseId).get();
  return snap.docs
    .map((d) => d.data() as Record<string, unknown>)
    .filter((c) => (c.triage as { is_lead?: boolean } | undefined)?.is_lead === true)
    .filter((c) => (channel ? c.channel === channel : true))
    .filter((c) => {
      const t = (c.last_message_at as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0;
      return t >= w.start.getTime() && t < w.end.getTime();
    })
    .map((c) => ({
      contact: (c.customer_ref as string) || "(unknown)",
      channel: (c.channel as string) || "",
      subject: (c.subject as string) || "",
      captured: fmtCaptured((c.last_message_at as FirebaseFirestore.Timestamp)?.toDate?.()),
    }));
}

function fmtCaptured(d?: Date): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

async function gatherWeb(enterpriseId: string, w: Window) {
  const snap = await db.collection("analytics_events").where("workspace_id", "==", enterpriseId).get();
  const events = snap.docs
    .map((d) => d.data() as Record<string, unknown>)
    .filter((e) => e.source === "web")
    .filter((e) => {
      const t = (e.timestamp as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0;
      return t >= w.start.getTime() && t < w.end.getTime();
    })
    .map((e) => e.payload as Record<string, unknown>);

  const pageviews = events.filter((p) => (p?.type ?? "pageview") === "pageview");
  const visitors = new Set(pageviews.map((p) => p?.visitor_id).filter(Boolean));
  const newVisitors = pageviews.filter((p) => p?.is_new).length;
  const countries = tally(pageviews.map((p) => p?.country as string));
  const pages = tally(pageviews.map((p) => shortPath(p?.url as string)));

  const metrics: Metrics = {
    pageviews: pageviews.length,
    visitors: visitors.size,
    new_visitors: newVisitors,
  };
  const samples = [
    `Top pages: ${topN(pages)}`,
    `Top countries: ${topN(countries)}`,
  ];
  return { metrics, samples };
}

async function gatherCrm(enterpriseId: string, w: Window) {
  const { getSalesSummary, getLeadsCreated } = await import("./connections/zoho");
  let metrics: Metrics = {};
  let samples: string[] = [];
  let leads: LeadRow[] = [];
  try {
    const sales = await getSalesSummary(enterpriseId, w.start, w.end);
    metrics = {
      leads_created: sales.leads_created,
      contacts_created: sales.contacts_created,
      deals_created: sales.deals_created,
      deals_won: sales.deals_won,
      revenue_won: Math.round(sales.revenue_won),
      pipeline_created: Math.round(sales.pipeline_created_value),
    };
    const stageLine = Object.entries(sales.by_stage)
      .map(([k, v]) => `${k} (${v})`)
      .join(", ");
    samples = [
      stageLine ? `Deal stages: ${stageLine}` : "",
      sales.top_deals.length ? `Top deals: ${sales.top_deals.map((d) => `${d.name} — ${d.amount}`).join("; ")}` : "",
    ].filter(Boolean);

    const zohoLeads = await getLeadsCreated(enterpriseId, w.start, w.end);
    leads = zohoLeads.map((l) => ({
      contact: l.company ? `${l.name} (${l.company})` : l.name,
      channel: "zoho",
      subject: l.status || l.email,
      captured: l.created,
    }));
  } catch (e) {
    logger.warn("gatherCrm zoho read failed; falling back to local", { error: (e as Error).message });
    leads = await gatherLeads(enterpriseId, w);
    metrics = { leads_captured: leads.length };
  }
  return { metrics, samples, leads };
}

function tally(items: (string | undefined)[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const it of items) {
    if (!it) continue;
    m[it] = (m[it] ?? 0) + 1;
  }
  return m;
}
function topN(m: Record<string, number>, n = 5): string {
  const arr = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
  return arr.length ? arr.map(([k, v]) => `${k} (${v})`).join(", ") : "none";
}
function shortPath(url?: string): string {
  if (!url) return "/";
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url.slice(0, 60);
  }
}

async function summarize(opts: {
  orgName: string;
  meta: AgentMeta;
  period: Period;
  w: Window;
  metrics: Metrics;
  samples: string[];
  childSummaries?: string[]; // for roll-ups: the smaller reports being synthesized
  childPeriod?: Period;
}): Promise<string> {
  const { orgName, meta, period, w, metrics, samples, childSummaries, childPeriod } = opts;
  const metricLines = Object.entries(metrics)
    .map(([k, v]) => `- ${businessLabel(k)}: ${v}`)
    .join("\n");
  const hasActivity = Object.values(metrics).some((v) => v > 0) || (childSummaries?.length ?? 0) > 0;
  if (!hasActivity) {
    return `No ${channelArea(meta)} activity to report for ${w.label}.`;
  }

  const scope =
    meta.kind === "crm"
      ? `sales and CRM performance (leads, deals, pipeline and revenue)`
      : meta.kind === "web"
      ? `website audience and traffic`
      : `customer conversations and inquiries on ${meta.label}`;

  const system = `You are a business analyst writing an executive ${periodTitle(period)} report for ${orgName}, covering ${scope}.
Write FOR THE COMPANY — focus on business outcomes, trends, and what it means, NOT on what an AI or software did.
Structure: 2-4 sentence narrative of how the business did this period, then a short "Highlights" bullet list, then a one-line "What to watch" or recommendation if the data supports one.
Use the real numbers provided. Never invent figures, names, or facts. Plain professional markdown, no preamble.`;

  const prompt = [
    `Company: ${orgName}`,
    `Area: ${scope}`,
    `Period: ${periodTitle(period)} — ${w.label}`,
    ``,
    `Figures for this period:`,
    metricLines,
    samples.length ? `\nContext:\n${samples.map((s) => `- ${s}`).join("\n")}` : "",
    childSummaries && childSummaries.length
      ? `\nThis ${period} report should synthesize these underlying ${childPeriod} reports (roll them up into the bigger picture and trend, don't just concatenate):\n\n${childSummaries
          .map((s, i) => `[${i + 1}] ${s}`)
          .join("\n\n")}`
      : "",
    ``,
    `Write the report.`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const r = await callGemini({ system, prompt });
    return r.text.trim() || fallbackSummary(meta, metricLines);
  } catch (e) {
    logger.warn("report summary failed", { error: (e as Error).message });
    return fallbackSummary(meta, metricLines);
  }
}

function channelArea(meta: AgentMeta): string {
  return meta.kind === "crm" ? "sales" : meta.kind === "web" ? "website" : meta.label;
}

// Human/business labels for raw metric keys.
const LABELS: Record<string, string> = {
  inbound: "customer messages received",
  replies: "replies sent",
  conversations: "active conversations",
  leads: "leads captured",
  leads_captured: "leads captured",
  leads_created: "new leads",
  contacts_created: "new contacts",
  deals_created: "new deals",
  deals_won: "deals won",
  revenue_won: "revenue won",
  pipeline_created: "pipeline created",
  suggested_actions: "actions suggested",
  sent: "actions completed",
  pageviews: "page views",
  visitors: "unique visitors",
  new_visitors: "new visitors",
};
function businessLabel(key: string): string {
  return LABELS[key] ?? key.replace(/_/g, " ");
}

function fallbackSummary(meta: AgentMeta, metricLines: string): string {
  return `${meta.label} activity summary:\n\n${metricLines}`;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/** Larger reports are built from the smaller ones beneath them. */
function childPeriodOf(period: Period): Period | null {
  switch (period) {
    case "weekly":
      return "daily";
    case "monthly":
      return "daily";
    case "quarterly":
      return "monthly";
    case "annual":
      return "monthly";
    default:
      return null; // daily is built from raw activity
  }
}

/** Fetch already-generated child reports for an agent within a window. */
async function fetchChildReports(enterpriseId: string, agent: string, childPeriod: Period, w: Window) {
  const snap = await db.collection("reports").where("enterprise_id", "==", enterpriseId).get();
  return snap.docs
    .map((d) => d.data() as Record<string, unknown>)
    .filter((r) => r.agent === agent && r.period === childPeriod)
    .filter((r) => {
      const t = (r.period_start as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0;
      return t >= w.start.getTime() && t < w.end.getTime();
    });
}

function sumMetrics(reports: Record<string, unknown>[]): Metrics {
  const out: Metrics = {};
  for (const r of reports) {
    const m = (r.metrics as Metrics) ?? {};
    for (const [k, v] of Object.entries(m)) out[k] = (out[k] ?? 0) + (Number(v) || 0);
  }
  return out;
}

/** Gather raw activity for the daily (leaf) report. */
async function gatherRaw(enterpriseId: string, meta: AgentMeta, w: Window) {
  if (meta.kind === "messaging") {
    const channel = CHANNEL_BY_AGENT[meta.agent];
    const m = await gatherMessaging(enterpriseId, channel, w);
    const actions = await gatherActions(enterpriseId, `${meta.agent}-agent`, w);
    const leads = await gatherLeads(enterpriseId, w, channel);
    return {
      metrics: { ...m.metrics, leads: leads.length, suggested_actions: actions.proposed, sent: actions.executed } as Metrics,
      samples: m.samples.length ? [`Recent subjects: ${m.samples.slice(0, 8).join("; ")}`] : [],
      leads,
    };
  }
  if (meta.kind === "crm") {
    return gatherCrm(enterpriseId, w);
  }
  const web = await gatherWeb(enterpriseId, w);
  return { metrics: web.metrics, samples: web.samples, leads: [] as LeadRow[] };
}

/** Generate one report doc for an agent + period. Idempotent by deterministic id. */
export async function generateReport(
  enterpriseId: string,
  meta: AgentMeta,
  period: Period,
  w: Window,
  orgName: string
): Promise<{ id: string; created: boolean }> {
  const id = `${enterpriseId}_${meta.agent}_${period}_${w.key}`;
  const ref = db.doc(`reports/${id}`);
  const existing = await ref.get();
  if (existing.exists) return { id, created: false };

  let metrics: Metrics = {};
  let samples: string[] = [];
  let leads: LeadRow[] = [];
  let childSummaries: string[] | undefined;
  let childPeriod: Period | undefined;

  const child = childPeriodOf(period);
  if (child) {
    // Roll-up: build from the smaller reports beneath this period.
    const children = await fetchChildReports(enterpriseId, meta.agent, child, w);
    if (children.length > 0) {
      childPeriod = child;
      metrics = sumMetrics(children);
      childSummaries = children
        .sort(
          (a, b) =>
            ((a.period_start as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0) -
            ((b.period_start as FirebaseFirestore.Timestamp)?.toMillis?.() ?? 0)
        )
        .map((r) => `${(r.period_label as string) ?? ""}: ${(r.summary as string) ?? ""}`);
      // Leads for the roll-up spreadsheet still come from source data over the window.
      if (meta.kind === "crm") leads = (await gatherCrm(enterpriseId, w)).leads;
      else if (meta.kind === "messaging") leads = await gatherLeads(enterpriseId, w, CHANNEL_BY_AGENT[meta.agent]);
    } else {
      // No children yet (e.g. on-demand) — fall back to raw over the full window.
      const raw = await gatherRaw(enterpriseId, meta, w);
      metrics = raw.metrics;
      samples = raw.samples;
      leads = raw.leads;
    }
  } else {
    const raw = await gatherRaw(enterpriseId, meta, w);
    metrics = raw.metrics;
    samples = raw.samples;
    leads = raw.leads;
  }

  const summary = await summarize({ orgName, meta, period, w, metrics, samples, childSummaries, childPeriod });
  const title = `${meta.label} — ${periodTitle(period)} report`;

  // Generate downloadable company documents (Word narrative + Excel of leads).
  let files: Awaited<ReturnType<typeof generateReportFiles>> = [];
  try {
    files = await generateReportFiles({
      enterpriseId,
      reportId: id,
      orgName,
      agentLabel: meta.label,
      title,
      periodLabel: w.label,
      periodTitle: periodTitle(period),
      metrics,
      summary,
      leads,
    });
  } catch (e) {
    logger.error("report file generation failed", { id, error: (e as Error).message });
  }

  await ref.set({
    enterprise_id: enterpriseId,
    agent: meta.agent,
    agent_label: meta.label,
    logo: meta.logo,
    period,
    period_key: w.key,
    period_label: w.label,
    period_start: w.start,
    period_end: w.end,
    title,
    summary,
    metrics,
    files,
    created_at: FieldValue.serverTimestamp(),
  });
  return { id, created: true };
}

function periodTitle(p: Period): string {
  return { daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", annual: "Annual" }[p];
}

/** Active reporting agents for an enterprise (from its connections). */
async function activeAgents(enterpriseId: string): Promise<AgentMeta[]> {
  const snap = await db.collection("connections").where("enterprise_id", "==", enterpriseId).get();
  const metas: AgentMeta[] = [];
  for (const d of snap.docs) {
    const data = d.data();
    if (data.status !== "active") continue;
    const meta = AGENT_BY_CONNECTION[data.type as string];
    if (meta) metas.push(meta);
  }
  return metas;
}

/**
 * Hourly entrypoint: for every enterprise at local midnight, generate all due
 * reports for each of its active agents.
 */
export async function generateDueReports(now = new Date()): Promise<{ enterprises: number; reports: number }> {
  const entSnap = await db.collection("enterprises").get();
  let reports = 0;
  let enterprises = 0;

  for (const doc of entSnap.docs) {
    const ent = doc.data();
    const timeZone = (ent.timezone as string) || "UTC";
    const local = getLocalParts(now, timeZone);
    if (local.hour !== 0) continue; // only fire at local midnight

    enterprises++;
    const todayStart = zonedTimeToUtc(local.year, local.month, local.day, 0, 0, timeZone);
    const orgName = (ent.name as string) || "the team";
    const periods = duePeriods(todayStart, timeZone);
    const agents = await activeAgents(doc.id);

    for (const period of periods) {
      const w = windowFor(period, todayStart, timeZone);
      for (const meta of agents) {
        try {
          const r = await generateReport(doc.id, meta, period, w, orgName);
          if (r.created) reports++;
        } catch (e) {
          logger.error("generateReport failed", { enterprise: doc.id, agent: meta.agent, period, error: (e as Error).message });
        }
      }
    }
  }
  return { enterprises, reports };
}

/**
 * On-demand generation for testing — builds the last completed period for each
 * active agent, ignoring the time-of-day gate.
 */
export async function generateReportsNow(
  enterpriseId: string,
  period: Period = "daily"
): Promise<{ reports: string[] }> {
  const entSnap = await db.doc(`enterprises/${enterpriseId}`).get();
  const ent = entSnap.data() ?? {};
  const timeZone = (ent.timezone as string) || "UTC";
  const orgName = (ent.name as string) || "the team";

  const now = new Date();
  const local = getLocalParts(now, timeZone);
  const todayStart = zonedTimeToUtc(local.year, local.month, local.day, 0, 0, timeZone);
  const w = windowFor(period, todayStart, timeZone);

  const agents = await activeAgents(enterpriseId);
  const out: string[] = [];
  for (const meta of agents) {
    const r = await generateReport(enterpriseId, meta, period, w, orgName);
    out.push(`${meta.label}:${r.created ? "created" : "exists"}`);
  }
  return { reports: out };
}
