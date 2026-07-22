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

  await connDoc(enterpriseId).set(
    {
      enterprise_id: enterpriseId,
      type: "zoho",
      auth_type: "oauth2",
      status: "active",
      api_domain: apiDomain,
      accounts_domain: accounts,
      refresh_token: tokens.refresh_token ?? null,
      access_token: tokens.access_token,
      access_token_expires_at: expiresAt,
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
  const data = snap.data() as
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
  await connDoc(enterpriseId).update({
    access_token: tokens.access_token,
    access_token_expires_at: expiresAt,
    updated_at: FieldValue.serverTimestamp(),
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
  const cols = encodeURIComponent(fields.join(","));
  const data = await zohoRequest(
    enterpriseId,
    `${module}?fields=${cols}&sort_by=Created_Time&sort_order=desc&per_page=${Math.min(limit, 200)}`
  );
  const records: any[] = data?.data ?? [];
  const s = start.getTime();
  const e = end.getTime();
  return records.filter((r) => {
    const t = r.Created_Time ? new Date(r.Created_Time).getTime() : 0;
    return t >= s && t < e;
  });
}

/** Open (not-closed) deals with their pipeline value — current CRM state, not window-bound. */
export async function getOpenPipeline(
  enterpriseId: string
): Promise<{ open_deals: number; open_pipeline_value: number }> {
  try {
    const data = await zohoRequest(
      enterpriseId,
      `Deals?fields=${encodeURIComponent("Deal_Name,Stage,Amount")}&sort_by=Amount&sort_order=desc&per_page=200`
    );
    const rows: any[] = (data?.data ?? []).filter((d: any) => !/closed|won|lost/i.test(String(d.Stage ?? "")));
    const value = rows.reduce((sum, d) => sum + (Number(d.Amount) || 0), 0);
    return { open_deals: rows.length, open_pipeline_value: Math.round(value) };
  } catch {
    return { open_deals: 0, open_pipeline_value: 0 };
  }
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
  };

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
  return data?.data?.[0]?.details?.id ?? null;
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
  return data?.data?.[0]?.details?.id ?? null;
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
