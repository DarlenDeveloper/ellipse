import { db, FieldValue } from "../admin";

/**
 * Microsoft 365 connection (Microsoft Graph).
 *
 * OAuth2 auth-code flow against Entra ID (multi-tenant, authority "common").
 * First pass is connection-only: consent → callback → store refresh token, with
 * a verify ping. File/Excel/Word creation comes later.
 *
 * NOTE (security debt, same as others): refresh token stored in Firestore for now.
 */

const REDIRECT_URI = "https://us-central1-ellipse-desk.cloudfunctions.net/microsoftOAuthCallback";
const AUTHORITY = "https://login.microsoftonline.com/common";

// Minimal scopes to establish + verify the connection. Add Files.ReadWrite /
// Mail.* later when we build those capabilities.
const SCOPES = ["openid", "profile", "email", "offline_access", "User.Read"];

function connDoc(enterpriseId: string) {
  return db.doc(`connections/${enterpriseId}_microsoft365`);
}

/** Build the Microsoft consent URL. `state` carries enterpriseId back to us. */
export function buildConsentUrl(enterpriseId: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID ?? "",
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    response_mode: "query",
    scope: SCOPES.join(" "),
    state: enterpriseId,
    prompt: "select_account",
  });
  return `${AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return (await res.json()) as TokenResponse;
}

/** Exchange the auth code for tokens, fetch the account, and persist the connection. */
export async function handleCallback(code: string, enterpriseId: string): Promise<string> {
  const tokens = await tokenRequest(
    new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID ?? "",
      client_secret: process.env.MS_CLIENT_SECRET ?? "",
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      code,
      scope: SCOPES.join(" "),
    })
  );
  if (!tokens.access_token || tokens.error) {
    throw new Error(`MS token exchange failed: ${tokens.error_description ?? tokens.error ?? "no token"}`);
  }

  // Who connected?
  let email = "unknown";
  try {
    const me = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const d = (await me.json()) as any;
    email = d.mail || d.userPrincipalName || "unknown";
  } catch {
    // non-fatal
  }

  const expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;
  await connDoc(enterpriseId).set(
    {
      enterprise_id: enterpriseId,
      type: "microsoft365",
      auth_type: "oauth2",
      status: "active",
      account_email: email,
      refresh_token: tokens.refresh_token ?? null,
      access_token: tokens.access_token,
      access_token_expires_at: expiresAt,
      scopes: SCOPES,
      connected_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return email;
}

/** Return a valid access token, refreshing on expiry. */
export async function authedTokenFor(enterpriseId: string): Promise<string> {
  const snap = await connDoc(enterpriseId).get();
  const data = snap.data() as
    | { refresh_token?: string; access_token?: string; access_token_expires_at?: number }
    | undefined;
  if (!data?.refresh_token) throw new Error("microsoft365 not connected");

  if (data.access_token && data.access_token_expires_at && data.access_token_expires_at - 60_000 > Date.now()) {
    return data.access_token;
  }

  const tokens = await tokenRequest(
    new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID ?? "",
      client_secret: process.env.MS_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: data.refresh_token,
      scope: SCOPES.join(" "),
    })
  );
  if (!tokens.access_token || tokens.error) {
    throw new Error(`MS token refresh failed: ${tokens.error_description ?? tokens.error ?? "no token"}`);
  }

  const expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;
  await connDoc(enterpriseId).update({
    access_token: tokens.access_token,
    access_token_expires_at: expiresAt,
    // MS may issue a rotated refresh token — persist it if present.
    ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    updated_at: FieldValue.serverTimestamp(),
  });
  return tokens.access_token;
}

/** Verify the connection by reading the signed-in user's profile. */
export async function verifyConnection(enterpriseId: string): Promise<{ ok: boolean; email?: string; error?: string }> {
  try {
    const token = await authedTokenFor(enterpriseId);
    const res = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = (await res.json()) as any;
    if (d.error) return { ok: false, error: d.error.message };
    return { ok: true, email: d.mail || d.userPrincipalName };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
