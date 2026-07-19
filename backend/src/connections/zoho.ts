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
  init: { method?: string; body?: unknown } = {}
): Promise<any> {
  const { accessToken, apiDomain } = await authedClientFor(enterpriseId);
  const res = await fetch(`${apiDomain}/crm/v8/${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return null; // Zoho returns 204 for empty search results
  return res.json();
}

/** List CRM modules — used to verify the token/refresh/DC chain (in-scope read). */
export async function listModules(enterpriseId: string): Promise<any> {
  return zohoRequest(enterpriseId, "settings/modules");
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
