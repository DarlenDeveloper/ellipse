import { google } from "googleapis";
import { db, FieldValue } from "../admin";

const REDIRECT_URI = "https://us-central1-ellipse-desk.cloudfunctions.net/gmailOAuthCallback";

// Gmail read/modify + send, plus the connected account's email
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

export function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    REDIRECT_URI
  );
}

/** Build the Google consent URL. `state` carries the enterpriseId back to us. */
export function buildConsentUrl(enterpriseId: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline", // needed to receive a refresh token
    prompt: "consent",
    scope: SCOPES,
    state: enterpriseId,
  });
}

/** Exchange the auth code for tokens and persist the connection. */
export async function handleCallback(code: string, enterpriseId: string): Promise<string> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  // Fetch the connected account's email
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const me = await oauth2.userinfo.get();
  const email = me.data.email ?? "unknown";

  // NOTE (tech debt / security): refresh token stored in Firestore for speed.
  // TODO: move to Secret Manager, keyed by enterprise+connection, per architecture doc.
  await db.doc(`connections/${enterpriseId}_google-workspace`).set(
    {
      enterprise_id: enterpriseId,
      type: "google-workspace",
      auth_type: "oauth2",
      status: "active",
      account_email: email,
      refresh_token: tokens.refresh_token ?? null,
      scopes: SCOPES,
      connected_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Pull recent mail immediately so the inbox isn't empty after connecting
  try {
    await ingestRecentGmail(enterpriseId);
  } catch {
    // non-fatal — connection still succeeds; a manual sync can retry
  }

  return email;
}

/** Return an authed OAuth client for a connected enterprise (for API calls). */
export async function authedClientFor(enterpriseId: string) {
  const snap = await db.doc(`connections/${enterpriseId}_google-workspace`).get();
  const refresh = snap.data()?.refresh_token as string | undefined;
  const accountEmail = snap.data()?.account_email as string | undefined;
  if (!refresh) throw new Error("google-workspace not connected");
  const client = oauthClient();
  client.setCredentials({ refresh_token: refresh });
  return { client, accountEmail };
}

function header(headers: { name?: string | null; value?: string | null }[], name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

// Recursively pull the best text body out of a Gmail payload
function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  if (payload.parts) {
    const plain = payload.parts.find((p: any) => p.mimeType === "text/plain");
    const html = payload.parts.find((p: any) => p.mimeType === "text/html");
    const target = plain || html || payload.parts[0];
    return extractBody(target);
  }
  return "";
}

function parseEmailAddress(from: string): string {
  const m = from.match(/<(.+?)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

/**
 * Pull recent inbox messages and normalize them into Firestore
 * (conversations + messages), plus log analytics_events. This is the "read" step.
 */
export async function ingestRecentGmail(enterpriseId: string, max = 15): Promise<number> {
  const { client, accountEmail } = await authedClientFor(enterpriseId);
  const gmail = google.gmail({ version: "v1", auth: client });

  const list = await gmail.users.messages.list({ userId: "me", maxResults: max, q: "in:inbox" });
  const ids = list.data.messages ?? [];
  let count = 0;

  for (const { id } of ids) {
    if (!id) continue;
    const msgDocRef = db.doc(`messages/${id}`);
    if ((await msgDocRef.get()).exists) continue; // already ingested

    const full = await gmail.users.messages.get({ userId: "me", id, format: "full" });
    const payload = full.data.payload;
    const headers = payload?.headers ?? [];

    const from = header(headers, "From");
    const to = header(headers, "To");
    const subject = header(headers, "Subject");
    const dateStr = header(headers, "Date");
    const fromEmail = parseEmailAddress(from);
    const threadId = full.data.threadId ?? id;
    const senderType = accountEmail && fromEmail.includes(accountEmail) ? "us" : "customer";
    const timestamp = dateStr ? new Date(dateStr) : new Date();

    // Conversation (keyed by Gmail thread)
    await db.doc(`conversations/${enterpriseId}_${threadId}`).set(
      {
        enterprise_id: enterpriseId,
        channel: "google-workspace",
        thread_id: threadId,
        subject: subject || "(no subject)",
        customer_ref: senderType === "customer" ? fromEmail : to,
        status: "open",
        last_message_at: timestamp,
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Message
    await msgDocRef.set({
      conversation_id: `${enterpriseId}_${threadId}`,
      enterprise_id: enterpriseId,
      channel: "google-workspace",
      gmail_id: id,
      thread_id: threadId,
      sender_type: senderType,
      from,
      from_email: fromEmail,
      to,
      subject,
      snippet: full.data.snippet ?? "",
      body: extractBody(payload).slice(0, 20000),
      timestamp,
      created_at: FieldValue.serverTimestamp(),
    });

    await db.collection("analytics_events").add({
      source: "message",
      workspace_id: enterpriseId,
      payload: { channel: "google-workspace", from: fromEmail, subject },
      timestamp: FieldValue.serverTimestamp(),
    });

    count++;
  }

  return count;
}
