import { db, FieldValue } from "../admin";

/**
 * Zoho CRM connection.
 *
 * Mirrors connections/google.ts: OAuth2 consent → callback → token store, then
 * authed API calls. Zoho differs from Gmail in two ways we handle here:
 *   - Multi-DC: each org lives in one data center (.com/.eu/.in/...). The token
 *     exchange must hit the DC-specific accounts server, and API calls the
 *     DC-specific api_domain returned with the token. We capture both at connect.
 *   - Manual token refresh: access tokens live ~1h. We cache the access token +
 *     expiry on the connection doc and only refresh when expired (Zoho rate-limits
 *     refreshes to 10 per 10 min per refresh token).
 */

const REDIRECT_URI = "https://us-central1-ellipse-desk.cloudfunctions.net/zohoOAuthCallback";
const DEFAULT_ACCOUNTS = "https://accounts.zoho.com";

// CRM record access + settings (metadata) + notifications (real-time, later).
const SCOPES = [
  "ZohoCRM.modules.ALL",
  "ZohoCRM.settings.ALL",
  "ZohoCRM.notifications.ALL",
  "ZohoCRM.settings.mailmerge.CREATE",
  "ZohoWriter.documentEditor.ALL",
  "ZohoWriter.merge.ALL",
];

function connDoc(enterpriseId: string) {
  return db.doc(`connections/${enterpriseId}_zoho`);
}

/** Build the Zoho consent URL. `state` carries enterpriseId back to the callback. */
export function buildConsentUrl(enterpriseId: string): string {
  const params = new URLSearchParams({
    scope: SCOPES.join(","),
    client_id: process.env.ZOHO_CLIENT_ID ?? "",
    response_type: "code",
    access_type: "offline", // needed for a refresh token
    prompt: "consent",
    redirect_uri: REDIRECT_URI,
    state: enterpriseId,
  });
  return `${DEFAULT_ACCOUNTS}/oauth/v2/auth?${params.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  api_domain?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
};

/**
 * Exchange the auth code for tokens and persist the connection.
 * `accountsServer` comes from the callback's `accounts-server` param (DC-specific).
 */
export async function handleCallback(
  code: string,
  enterpriseId: string,
  accountsServer?: string
): Promise<string> {
  const accounts = accountsServer || DEFAULT_ACCOUNTS;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.ZOHO_CLIENT_ID ?? "",
    client_secret: process.env.ZOHO_CLIENT_SECRET ?? "",
    redirect_uri: REDIRECT_URI,
    code,
  });

  const res = await fetch(`${accounts}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const tokens = (await res.json()) as TokenResponse;
  if (!tokens.access_token || tokens.error) {
    throw new Error(`Zoho token exchange failed: ${tokens.error ?? "no access_token"}`);
  }

  const apiDomain = tokens.api_domain ?? "https://www.zohoapis.com";
  const expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;

  const { saveConnectionSecret } = await import("../connectionSecrets");
  await saveConnectionSecret(enterpriseId, "zoho", {
    refresh_token: tokens.refresh_token ?? null,
    access_token: tokens.access_token,
    access_token_expires_at: expiresAt,
  });
  await connDoc(enterpriseId).set(
    {
      enterprise_id: enterpriseId,
      type: "zoho",
      auth_type: "oauth2",
      status: "active",
      api_domain: apiDomain,
      accounts_domain: accounts,
      scopes: SCOPES,
      connected_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Backfill the last 30 days of records so analytics aren't empty after connect.
  try {
    await backfillZoho(enterpriseId, 30);
  } catch {
    // non-fatal — a manual backfill can retry
  }

  return apiDomain;
}

/**
 * Return a valid access token + api domain for an enterprise, refreshing if the
 * cached token has expired. Refresh happens only on expiry (rate-limit friendly).
 */
export async function authedClientFor(
  enterpriseId: string
): Promise<{ accessToken: string; apiDomain: string }> {
  const snap = await connDoc(enterpriseId).get();
  const { getConnectionSecret, saveConnectionSecret } = await import("../connectionSecrets");
  const secret = await getConnectionSecret(enterpriseId, "zoho", snap.data());
  const data = {
    ...(snap.data() as Record<string, unknown>),
    refresh_token: secret.refresh_token,
    access_token: secret.access_token,
    access_token_expires_at: secret.access_token_expires_at,
  } as
    | {
        refresh_token?: string;
        access_token?: string;
        access_token_expires_at?: number;
        api_domain?: string;
        accounts_domain?: string;
      }
    | undefined;

  if (!data?.refresh_token) throw new Error("zoho not connected");
  const apiDomain = data.api_domain ?? "https://www.zohoapis.com";

  // Still valid (60s safety margin)?
  if (data.access_token && data.access_token_expires_at && data.access_token_expires_at - 60_000 > Date.now()) {
    return { accessToken: data.access_token, apiDomain };
  }

  const accounts = data.accounts_domain ?? DEFAULT_ACCOUNTS;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.ZOHO_CLIENT_ID ?? "",
    client_secret: process.env.ZOHO_CLIENT_SECRET ?? "",
    refresh_token: data.refresh_token,
  });

  const res = await fetch(`${accounts}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const tokens = (await res.json()) as TokenResponse;
  if (!tokens.access_token || tokens.error) {
    throw new Error(`Zoho token refresh failed: ${tokens.error ?? "no access_token"}`);
  }

  const expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;
  await saveConnectionSecret(enterpriseId, "zoho", {
    access_token: tokens.access_token,
    access_token_expires_at: expiresAt,
  });

  return { accessToken: tokens.access_token, apiDomain };
}

async function zohoRequest(
  enterpriseId: string,
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<any> {
  const { accessToken, apiDomain } = await authedClientFor(enterpriseId);
  const res = await fetch(`${apiDomain}/crm/v8/${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204 || res.status === 304) return null; // 204 empty, 304 nothing modified
  return res.json();
}

/** List CRM modules — used to verify the token/refresh/DC chain (in-scope read). */
export async function listModules(enterpriseId: string): Promise<any> {
  return zohoRequest(enterpriseId, "settings/modules");
}

/** List a module's fields (api_name + label + data type) — for metadata-driven reports. */
export async function listModuleFields(
  enterpriseId: string,
  module: string
): Promise<{ api_name: string; label: string; data_type: string }[]> {
  const data = await zohoRequest(enterpriseId, `settings/fields?module=${encodeURIComponent(module)}`);
  return (data?.fields ?? []).map((f: any) => ({
    api_name: f.api_name,
    label: f.field_label,
    data_type: f.data_type,
  }));
}

export type ZohoEnrichment = {
  found: boolean;
  type: "contact" | "lead" | null;
  record: { id: string; name: string; email: string; account?: string } | null;
  deals: { id: string; name: string; stage: string; amount: number | null }[];
};

/** Deals related to a contact (related-list endpoint). */
async function relatedDeals(enterpriseId: string, contactId: string) {
  const data = await zohoRequest(enterpriseId, `Contacts/${contactId}/Deals`);
  return (data?.data ?? []).map((d: any) => ({
    id: d.id,
    name: d.Deal_Name ?? "(unnamed deal)",
    stage: d.Stage ?? "unknown",
    amount: d.Amount ?? null,
  }));
}

/**
 * Look a customer up in Zoho by email and pull the context an agent needs:
 * the Contact (or Lead fallback) plus any related Deals. This is the "read/enrich"
 * step that turns a bare inbound email into CRM-aware context.
 */
export async function enrichFromZoho(enterpriseId: string, email: string): Promise<ZohoEnrichment> {
  const empty: ZohoEnrichment = { found: false, type: null, record: null, deals: [] };
  if (!email) return empty;

  const contact = await searchByEmail(enterpriseId, "Contacts", email);
  if (contact) {
    return {
      found: true,
      type: "contact",
      record: {
        id: contact.id,
        name: contact.Full_Name ?? `${contact.First_Name ?? ""} ${contact.Last_Name ?? ""}`.trim(),
        email,
        account: contact.Account_Name?.name,
      },
      deals: await relatedDeals(enterpriseId, contact.id),
    };
  }

  const lead = await searchByEmail(enterpriseId, "Leads", email);
  if (lead) {
    return {
      found: true,
      type: "lead",
      record: {
        id: lead.id,
        name: lead.Full_Name ?? `${lead.First_Name ?? ""} ${lead.Last_Name ?? ""}`.trim(),
        email,
        account: lead.Company,
      },
      deals: [],
    };
  }

  return empty;
}

// Modules we backfill + the fields we pull for each.
const BACKFILL_MODULES: Record<string, string> = {
  Leads: "Full_Name,Email,Company,Lead_Status,Created_Time",
  Contacts: "Full_Name,Email,Account_Name,Created_Time",
  Deals: "Deal_Name,Stage,Amount,Closing_Date,Created_Time",
};

/**
 * Backfill recent Zoho records into analytics_events so analytics/enrichment
 * aren't starting from zero. Pulls records modified within the last `sinceDays`
 * for Leads/Contacts/Deals (via the If-Modified-Since header) and logs one
 * analytics_event per record, timestamped by the record's own creation time so
 * historical charts reflect real history.
 *
 * Idempotent: each record's event doc is keyed by module+id, so re-running
 * overwrites rather than duplicating.
 */
export async function backfillZoho(
  enterpriseId: string,
  sinceDays = 30
): Promise<{ total: number; byModule: Record<string, number> }> {
  const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const byModule: Record<string, number> = {};
  let total = 0;

  const PER_PAGE = 200;
  const MAX_PAGES = 25; // safety cap: up to 5000 records/module

  for (const [module, fields] of Object.entries(BACKFILL_MODULES)) {
    let count = 0;
    let page = 1;
    try {
      while (page <= MAX_PAGES) {
        const data = await zohoRequest(
          enterpriseId,
          `${module}?fields=${encodeURIComponent(fields)}&per_page=${PER_PAGE}&page=${page}&sort_by=Created_Time&sort_order=desc`,
          { headers: { "If-Modified-Since": sinceIso } }
        );
        const records: any[] = data?.data ?? [];
        if (records.length === 0) break;

        // Firestore batched writes (max 500 ops per batch; PER_PAGE is 200, safe).
        const batch = db.batch();
        for (const r of records) {
          const created = r.Created_Time ? new Date(r.Created_Time) : new Date();
          batch.set(db.doc(`analytics_events/zoho_${module}_${r.id}`), {
            source: "zoho_record",
            workspace_id: enterpriseId,
            payload: {
              channel: "zoho",
              module,
              record_id: r.id,
              name: r.Full_Name ?? r.Deal_Name ?? null,
              email: r.Email ?? null,
              stage: r.Stage ?? null,
              amount: r.Amount ?? null,
            },
            timestamp: created,
          });
        }
        await batch.commit();
        count += records.length;

        if (!data?.info?.more_records) break;
        page++;
      }
    } catch (e) {
      console.error("backfillZoho module failed", module, (e as Error).message);
    }
    byModule[module] = count;
    total += count;
  }

  return { total, byModule };
}

// ---- Read / reporting capabilities (sales, pipeline, records) ----

/** Zoho COQL datetime format: ISO8601, seconds precision, explicit offset. */
function zfmt(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

/** Run a COQL query (Zoho's SQL-like record query). Returns the data rows. Throws on API error. */
export async function coql(enterpriseId: string, selectQuery: string): Promise<any[]> {
  const data = await zohoRequest(enterpriseId, "coql", {
    method: "POST",
    body: { select_query: selectQuery },
  });
  if (data === null) return []; // 204 No Content = no matching records
  if (data?.status === "error" || data?.code) {
    throw new Error(`Zoho COQL error: ${data.message ?? data.code ?? "unknown"}`);
  }
  return data?.data ?? [];
}

/**
 * Records created in a module within a window. Uses the standard records API
 * (works under ZohoCRM.modules.ALL — no separate COQL scope needed), sorted by
 * Created_Time desc, then filtered to the window in memory.
 */
export async function getRecordsCreated(
  enterpriseId: string,
  module: string,
  fields: string[],
  start: Date,
  end: Date,
  limit = 200
): Promise<any[]> {
  // Always fetch Created_Time — it's what we filter the window on. ("id" is
  // implicit and not accepted in the fields param, so drop it.)
  const wanted = Array.from(new Set([...fields.filter((f) => f.toLowerCase() !== "id"), "Created_Time"]));
  const cols = encodeURIComponent(wanted.join(","));
  const s = start.getTime();
  const e = end.getTime();
  const out: any[] = [];
  const PER = 200;
  const MAX_PAGES = 60;
  let token: string | undefined;
  let pages = 0;

  // Records are sorted Created_Time desc, so in-window rows are at the front —
  // page via cursor and stop as soon as we pass the window start.
  while (pages < MAX_PAGES) {
    // page_token is bound to the first call's params — resend them identically + append the token.
    const base = `${module}?fields=${cols}&sort_by=Created_Time&sort_order=desc&per_page=${PER}`;
    const path = token ? `${base}&page_token=${token}` : base;
    const data = await zohoRequest(enterpriseId, path);
    if (data?.status === "error") {
      throw new Error(`Zoho ${module} read error: ${data.message ?? data.code ?? "unknown"}`);
    }
    const rows: any[] = data?.data ?? [];
    let passedWindow = false;
    for (const r of rows) {
      const t = r.Created_Time ? new Date(r.Created_Time).getTime() : 0;
      if (t < s) {
        passedWindow = true;
        break;
      }
      if (t < e) out.push(r);
      if (out.length >= limit) {
        passedWindow = true;
        break;
      }
    }
    token = data?.info?.next_page_token;
    pages++;
    if (passedWindow || !token || rows.length === 0) break;
  }
  return out;
}

/**
 * Open (not-closed) deals with their pipeline value — current CRM state.
 * Uses cursor pagination (page_token) because orgs with >2000 deals can't be
 * paged with page numbers. Capped for latency; flags if the cap is hit.
 */
export async function getOpenPipeline(
  enterpriseId: string
): Promise<{ open_deals: number; open_pipeline_value: number; total_deals: number; capped: boolean }> {
  const fields = encodeURIComponent("Deal_Name,Stage,Amount");
  const PER = 200;
  const MAX_PAGES = 60; // up to 12,000 deals
  let open = 0;
  let value = 0;
  let total = 0;
  let token: string | undefined;
  let pages = 0;

  while (pages < MAX_PAGES) {
    // page_token is bound to the first call's params — resend them identically + append the token.
    const base = `Deals?fields=${fields}&sort_by=Modified_Time&sort_order=desc&per_page=${PER}`;
    const path = token ? `${base}&page_token=${token}` : base;
    const data = await zohoRequest(enterpriseId, path);
    if (data?.status === "error") {
      throw new Error(`Zoho Deals read error: ${data.message ?? data.code ?? "unknown"}`);
    }
    const rows: any[] = data?.data ?? [];
    for (const d of rows) {
      total++;
      if (!/closed|won|lost/i.test(String(d.Stage ?? ""))) {
        open++;
        value += Number(d.Amount) || 0;
      }
    }
    token = data?.info?.next_page_token;
    pages++;
    if (!token || rows.length === 0) break;
  }
  return { open_deals: open, open_pipeline_value: Math.round(value), total_deals: total, capped: pages >= MAX_PAGES && !!token };
}

export type SalesSummary = {
  leads_created: number;
  contacts_created: number;
  deals_created: number;
  deals_won: number;
  revenue_won: number;
  pipeline_created_value: number;
  open_deals: number;
  open_pipeline_value: number;
  by_stage: Record<string, number>;
  top_deals: { name: string; stage: string; amount: number }[];
  recent_leads: { name: string; company: string; created: string }[]; // latest leads, regardless of window
};

/**
 * Business sales summary from Zoho for a window: new leads/contacts/deals,
 * deals won + revenue, pipeline value created, and a stage breakdown. This is
 * the CRM half of a company report — real numbers, not agent activity.
 */
export async function getSalesSummary(
  enterpriseId: string,
  start: Date,
  end: Date
): Promise<SalesSummary> {
  const summary: SalesSummary = {
    leads_created: 0,
    contacts_created: 0,
    deals_created: 0,
    deals_won: 0,
    revenue_won: 0,
    pipeline_created_value: 0,
    open_deals: 0,
    open_pipeline_value: 0,
    by_stage: {},
    top_deals: [],
    recent_leads: [],
  };

  // Latest leads regardless of the window — so "do we have any leads?" is answerable.
  try {
    const recent = await zohoRequest(
      enterpriseId,
      `Leads?fields=${encodeURIComponent("Full_Name,Company,Created_Time")}&sort_by=Created_Time&sort_order=desc&per_page=10`
    );
    summary.recent_leads = (recent?.data ?? []).slice(0, 10).map((l: any) => ({
      name: l.Full_Name ?? "(unnamed)",
      company: l.Company ?? "",
      created: l.Created_Time ? String(l.Created_Time).slice(0, 10) : "",
    }));
  } catch {
    /* non-fatal */
  }

  const [leads, contacts, deals, pipeline] = await Promise.all([
    getRecordsCreated(enterpriseId, "Leads", ["id"], start, end, 200),
    getRecordsCreated(enterpriseId, "Contacts", ["id"], start, end, 200),
    getRecordsCreated(
      enterpriseId,
      "Deals",
      ["Deal_Name", "Stage", "Amount", "Closing_Date"],
      start,
      end,
      200
    ),
    getOpenPipeline(enterpriseId),
  ]);

  summary.open_deals = pipeline.open_deals;
  summary.open_pipeline_value = pipeline.open_pipeline_value;

  summary.leads_created = leads.length;
  summary.contacts_created = contacts.length;
  summary.deals_created = deals.length;

  for (const d of deals) {
    const stage = (d.Stage as string) || "Unknown";
    const amount = Number(d.Amount) || 0;
    summary.by_stage[stage] = (summary.by_stage[stage] ?? 0) + 1;
    summary.pipeline_created_value += amount;
    if (/won/i.test(stage)) {
      summary.deals_won++;
      summary.revenue_won += amount;
    }
  }

  summary.top_deals = deals
    .map((d) => ({ name: (d.Deal_Name as string) || "(unnamed)", stage: (d.Stage as string) || "", amount: Number(d.Amount) || 0 }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return summary;
}

export type CrmReportData = {
  counts: {
    new_leads: number;
    new_contacts: number;
    new_deals: number;
    deals_won: number;
    revenue_won: number;
    open_deals: number;
    open_pipeline_value: number;
  };
  leads: { name: string; company: string; email: string; source: string; status: string; created: string }[];
  deals: { name: string; stage: string; amount: number; closing: string; created: string }[];
  contacts: { name: string; email: string; account: string; created: string }[];
};

/**
 * Pull everything needed for a CRM report for a window — real records straight
 * from Zoho, so a report file can be built deterministically (no AI figures).
 */
export async function getCrmReportData(enterpriseId: string, start: Date, end: Date): Promise<CrmReportData> {
  const [leadsRaw, contactsRaw, dealsRaw, pipeline] = await Promise.all([
    getRecordsCreated(enterpriseId, "Leads", ["Full_Name", "Company", "Email", "Lead_Source", "Lead_Status"], start, end, 2000),
    getRecordsCreated(enterpriseId, "Contacts", ["Full_Name", "Email", "Account_Name"], start, end, 2000),
    getRecordsCreated(enterpriseId, "Deals", ["Deal_Name", "Stage", "Amount", "Closing_Date"], start, end, 2000),
    getOpenPipeline(enterpriseId),
  ]);

  const leads = leadsRaw.map((r) => ({
    name: (r.Full_Name as string) || "(unnamed)",
    company: (r.Company as string) || "",
    email: (r.Email as string) || "",
    source: (r.Lead_Source as string) || "",
    status: (r.Lead_Status as string) || "",
    created: r.Created_Time ? String(r.Created_Time).slice(0, 10) : "",
  }));
  const contacts = contactsRaw.map((r) => ({
    name: (r.Full_Name as string) || "(unnamed)",
    email: (r.Email as string) || "",
    account: (r.Account_Name?.name as string) || (r.Account_Name as string) || "",
    created: r.Created_Time ? String(r.Created_Time).slice(0, 10) : "",
  }));
  const deals = dealsRaw.map((r) => ({
    name: (r.Deal_Name as string) || "(unnamed)",
    stage: (r.Stage as string) || "",
    amount: Number(r.Amount) || 0,
    closing: (r.Closing_Date as string) || "",
    created: r.Created_Time ? String(r.Created_Time).slice(0, 10) : "",
  }));

  const won = deals.filter((d) => /won/i.test(d.stage));
  return {
    counts: {
      new_leads: leads.length,
      new_contacts: contacts.length,
      new_deals: deals.length,
      deals_won: won.length,
      revenue_won: Math.round(won.reduce((s, d) => s + d.amount, 0)),
      open_deals: pipeline.open_deals,
      open_pipeline_value: pipeline.open_pipeline_value,
    },
    leads,
    deals,
    contacts,
  };
}

export type QuoteRow = {
  subject: string;
  account: string;
  proforma: string;
  quote_date: string;
  owner: string;
  deal: string;
  stage: string;
  sub_total: number;
};

const lookupName = (v: any): string => (v && typeof v === "object" ? (v.name ?? "") : (v ?? "")) as string;

/**
 * Detailed Quotes report rows for a window — the exact columns the client wants:
 * Subject, Account Name, Proforma No., Quote Date, Quote Owner, Deal Name,
 * Quote Stage, Sub Total. Field API names verified from the org's metadata.
 */
export async function getQuotesDetailed(enterpriseId: string, start: Date, end: Date): Promise<QuoteRow[]> {
  const rows = await getRecordsCreated(
    enterpriseId,
    "Quotes",
    ["Subject", "Account_Name", "Prof_NO", "Quote_Date", "Owner", "Deal_Name", "Quote_Stage", "Sub_Total"],
    start,
    end,
    2000
  );
  return rows.map((r) => ({
    subject: (r.Subject as string) || "",
    account: lookupName(r.Account_Name),
    proforma: (r.Prof_NO as string) || "",
    quote_date: (r.Quote_Date as string) || "",
    owner: lookupName(r.Owner),
    deal: lookupName(r.Deal_Name),
    stage: (r.Quote_Stage as string) || "",
    sub_total: Number(r.Sub_Total) || 0,
  }));
}

export type QuoteForQuotation = {
  id: string;
  subject: string;
  proforma: string;
  account: string;
  owner: string;
  deal: string;
  sub_total: number;
  grand_total: number;
  items: { description: string; rate: number; qty: number }[];
};

/**
 * Fetch a single Quote (by proforma no, subject, account, or id) INCLUDING its
 * line items, so the agent can turn a real Zoho quote into a branded proforma.
 * Line items live in the Quotes `Product_Details` subform.
 */
export async function getQuoteForQuotation(
  enterpriseId: string,
  query: { id?: string; proforma?: string; subject?: string; account?: string }
): Promise<QuoteForQuotation | null> {
  let id = query.id;
  if (!id) {
    const criteria: string[] = [];
    if (query.proforma) criteria.push(`(Prof_NO:equals:${query.proforma})`);
    if (query.subject) criteria.push(`(Subject:starts_with:${query.subject})`);
    if (query.account) criteria.push(`(Account_Name:equals:${query.account})`);
    if (criteria.length) {
      const joined = criteria.length > 1 ? criteria.join("or") : criteria[0];
      const data = await zohoRequest(enterpriseId, `Quotes/search?criteria=${encodeURIComponent(joined)}`);
      id = data?.data?.[0]?.id;
    }
  }
  if (!id) return null;

  const rec = (await zohoRequest(enterpriseId, `Quotes/${id}`))?.data?.[0];
  if (!rec) return null;

  const subform = (rec.Quoted_Items ?? rec.Product_Details ?? []) as any[];
  const items = subform.map((li) => ({
    // Field names verified from live metadata: Product_Name (lookup), List_Price, Quantity, Description.
    description: lookupName(li.Product_Name) || (li.Description as string) || lookupName(li.product) || "",
    rate: Number(li.List_Price ?? li.list_price ?? li.Total_After_Discount ?? li.Net_Total ?? 0),
    qty: Number(li.Quantity ?? li.quantity ?? 1),
  }));

  return {
    id: rec.id,
    subject: (rec.Subject as string) || "",
    proforma: (rec.Prof_NO as string) || "",
    account: lookupName(rec.Account_Name),
    owner: lookupName(rec.Owner),
    deal: lookupName(rec.Deal_Name),
    sub_total: Number(rec.Sub_Total ?? 0),
    grand_total: Number(rec.Grand_Total ?? 0),
    items,
  };
}

/** TEMPORARY debug — most recent Quote's raw keys + line-item sample. Remove before ship. */
export async function debugRecentQuote(enterpriseId: string): Promise<any> {
  const list = await zohoRequest(enterpriseId, "Quotes?fields=Subject,Prof_NO&per_page=1&sort_by=Created_Time&sort_order=desc");
  const id = list?.data?.[0]?.id;
  if (!id) return { error: "no quotes found", list };
  const rec = (await zohoRequest(enterpriseId, `Quotes/${id}`))?.data?.[0];
  const subKey = rec?.Product_Details ? "Product_Details" : rec?.Quoted_Items ? "Quoted_Items" : null;
  const sub = (subKey ? rec[subKey] : []) as any[];
  return {
    id,
    keys: rec ? Object.keys(rec) : [],
    subformKey: subKey,
    lineItemSample: sub?.[0] ?? null,
    lineItemKeys: sub?.[0] ? Object.keys(sub[0]) : [],
  };
}

export type LeadListRow = {
  name: string;
  company: string;
  email: string;
  phone: string;
  status: string;
  owner: string;
  source: string;
  created: string;
};

/**
 * Actual list of leads (not aggregates) for the agent to answer "which/top/
 * recent leads" questions from real data. Sorted newest-first. `days` bounds the
 * window (default 90); `limit` caps rows. Includes Owner + Status so the agent
 * can reason about "unattended" (unassigned / still-New) leads.
 */
export async function getLeadsList(
  enterpriseId: string,
  opts: { days?: number; limit?: number } = {}
): Promise<LeadListRow[]> {
  const limit = Math.min(opts.limit ?? 25, 200);
  // Fetch the newest leads outright (no forced window) — the Leads module may not
  // have recent entries, and "top/recent leads" should still return real rows.
  const cols = encodeURIComponent("Full_Name,Company,Email,Phone,Lead_Status,Owner,Lead_Source,Created_Time");
  const data = await zohoRequest(
    enterpriseId,
    `Leads?fields=${cols}&sort_by=Created_Time&sort_order=desc&per_page=${limit}`
  );
  if (data?.status === "error") {
    throw new Error(`Zoho Leads read error: ${data.message ?? data.code ?? "unknown"}`);
  }
  let rows: any[] = data?.data ?? [];
  // Apply a recency filter only if the caller explicitly asked for a period.
  if (opts.days) {
    const cutoff = Date.now() - Math.min(opts.days, 3650) * 86400000;
    rows = rows.filter((r) => (r.Created_Time ? new Date(r.Created_Time).getTime() : 0) >= cutoff);
  }
  return rows.map((r) => ({
    name: (r.Full_Name as string) || "(unknown)",
    company: (r.Company as string) || "",
    email: (r.Email as string) || "",
    phone: (r.Phone as string) || "",
    status: (r.Lead_Status as string) || "",
    owner: lookupName(r.Owner),
    source: (r.Lead_Source as string) || "",
    created: r.Created_Time ? String(r.Created_Time).slice(0, 10) : "",
  }));
}

/** TEMPORARY debug — raw Leads fetch with an arbitrary fields list. Remove before ship. */
export async function debugLeadsRaw(enterpriseId: string, fields: string): Promise<any> {
  const data = await zohoRequest(
    enterpriseId,
    `Leads?fields=${encodeURIComponent(fields)}&sort_by=Created_Time&sort_order=desc&per_page=3`
  );
  return {
    httpStatus: data === null ? 204 : "200/other",
    status: data?.status,
    code: data?.code,
    message: data?.message,
    count: Array.isArray(data?.data) ? data.data.length : 0,
    firstKeys: data?.data?.[0] ? Object.keys(data.data[0]) : [],
  };
}

/** Leads created in a window, as rows for a report/spreadsheet. */
export async function getLeadsCreated(
  enterpriseId: string,
  start: Date,
  end: Date
): Promise<{ name: string; email: string; company: string; status: string; created: string }[]> {
  const rows = await getRecordsCreated(
    enterpriseId,
    "Leads",
    ["Full_Name", "Email", "Company", "Lead_Status", "Created_Time"],
    start,
    end,
    200
  );
  return rows.map((r) => ({
    name: (r.Full_Name as string) || "(unknown)",
    email: (r.Email as string) || "",
    company: (r.Company as string) || "",
    status: (r.Lead_Status as string) || "",
    created: r.Created_Time ? String(r.Created_Time).slice(0, 10) : "",
  }));
}

// ---- Action executors (routed from executeAgentAction for targetSystem "zoho") ----

/** Look up a record in a module by email — used to enrich inbound conversations. */
export async function searchByEmail(
  enterpriseId: string,
  module: string,
  email: string
): Promise<any | null> {
  const data = await zohoRequest(
    enterpriseId,
    `${module}/search?email=${encodeURIComponent(email)}`
  );
  return data?.data?.[0] ?? null;
}

/** General full-text record search, used to resolve Accounts and Products safely. */
export async function searchRecordsByWord(
  enterpriseId: string,
  module: string,
  word: string
): Promise<any[]> {
  const data = await zohoRequest(
    enterpriseId,
    `${module}/search?word=${encodeURIComponent(word)}`
  );
  return data?.data ?? [];
}

/** Download a Quote through a Zoho CRM/Writer mail-merge template as PDF bytes. */
export async function downloadQuoteMailMerge(
  enterpriseId: string,
  quoteId: string,
  templateName: string,
  fileName: string
): Promise<Buffer> {
  const { accessToken, apiDomain } = await authedClientFor(enterpriseId);
  const res = await fetch(`${apiDomain}/crm/v8/Quotes/${encodeURIComponent(quoteId)}/actions/download_mail_merge`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      download_mail_merge: [{
        mail_merge_template: { name: templateName },
        output_format: "pdf",
        file_name: fileName.replace(/\.pdf$/i, ""),
      }],
    }),
  });
  const bytes = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || contentType.includes("json")) {
    let message = `Zoho quotation merge failed (${res.status})`;
    try {
      const json = JSON.parse(bytes.toString("utf8"));
      message = json?.data?.[0]?.message || json?.message || json?.code || message;
    } catch {
      /* keep status error */
    }
    throw new Error(message);
  }
  if (!bytes.length) throw new Error("Zoho returned an empty quotation PDF");
  return bytes;
}

/** Create a record in a module (e.g. Leads, Contacts). Returns the new record id. */
export async function createRecord(
  enterpriseId: string,
  module: string,
  fields: Record<string, unknown>
): Promise<string | null> {
  const data = await zohoRequest(enterpriseId, module, {
    method: "POST",
    body: { data: [fields] },
  });
  const result = data?.data?.[0];
  if (result?.status === "error" || result?.code) {
    throw new Error(`Zoho ${module} create failed: ${result.message ?? result.code}`);
  }
  return result?.details?.id ?? null;
}

/** Update an existing record by id. */
export async function updateRecord(
  enterpriseId: string,
  module: string,
  recordId: string,
  fields: Record<string, unknown>
): Promise<string | null> {
  const data = await zohoRequest(enterpriseId, `${module}/${recordId}`, {
    method: "PUT",
    body: { data: [fields] },
  });
  const result = data?.data?.[0];
  if (result?.status === "error" || result?.code) {
    throw new Error(`Zoho ${module} update failed: ${result.message ?? result.code}`);
  }
  return result?.details?.id ?? null;
}

/** Attach a note to a record. */
export async function addNote(
  enterpriseId: string,
  module: string,
  recordId: string,
  content: string,
  title = "Ellipse"
): Promise<string | null> {
  const data = await zohoRequest(enterpriseId, `${module}/${recordId}/Notes`, {
    method: "POST",
    body: { data: [{ Note_Title: title, Note_Content: content }] },
  });
  return data?.data?.[0]?.details?.id ?? null;
}
