import { google } from "googleapis";
import { db, FieldValue } from "../admin";
import { canAcceptIncomingAttachment, saveIncomingAttachments, type IncomingAttachment } from "../incomingAttachments";

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
export function buildConsentUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline", // needed to receive a refresh token
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

/** Exchange the auth code for tokens and persist the connection. */
export async function handleCallback(code: string, enterpriseId: string, ownerUid?: string): Promise<string> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  // Fetch the connected account's email
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const me = await oauth2.userinfo.get();
  const email = me.data.email ?? "unknown";

  // Secret (refresh token) goes to the locked connection_secrets collection;
  // the public connections doc holds only non-secret metadata.
  const { saveConnectionSecret } = await import("../connectionSecrets");
  await saveConnectionSecret(enterpriseId, "google-workspace", { refresh_token: tokens.refresh_token ?? null }, ownerUid);
  const connectionId = `${enterpriseId}_google-workspace${ownerUid ? `_personal_${ownerUid}` : ""}`;
  await db.doc(`connections/${connectionId}`).set(
    {
      enterprise_id: enterpriseId,
      type: "google-workspace",
      auth_type: "oauth2",
      status: "active",
      account_email: email,
      scopes: SCOPES,
      connected_at: FieldValue.serverTimestamp(),
      scope: ownerUid ? "personal" : "org",
      owner_uid: ownerUid ?? null,
    },
    { merge: true }
  );

  // Pull recent mail immediately so the inbox isn't empty after connecting
  try {
    await ingestRecentGmail(enterpriseId, 15, ownerUid);
  } catch {
    // non-fatal — connection still succeeds; a manual sync can retry
  }

  return email;
}

/**
 * Send a reply within an existing Gmail thread. Fetches the thread's latest
 * message to set proper In-Reply-To / References headers so it threads correctly,
 * then sends a plain-text reply. Returns the new Gmail message id.
 */
export async function sendGmailReply(
  enterpriseId: string,
  threadId: string,
  to: string,
  subject: string,
  body: string,
  attachment?: { filename: string; contentType: string; content: Buffer },
  ownerUid?: string,
  cc?: string,
  bodyHtml?: string
): Promise<string> {
  const { client } = await authedClientFor(enterpriseId, ownerUid);
  const gmail = google.gmail({ version: "v1", auth: client });

  // Pull the latest message's Message-ID/References for threading.
  let inReplyTo = "";
  let references = "";
  try {
    const thread = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "metadata",
      metadataHeaders: ["Message-ID", "References"],
    });
    const msgs = thread.data.messages ?? [];
    const last = msgs[msgs.length - 1];
    const h = last?.payload?.headers ?? [];
    inReplyTo = header(h, "Message-ID");
    references = header(h, "References") || inReplyTo;
  } catch {
    // threading headers are best-effort
  }

  const subjectLine = subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
  const headers = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : "",
    `Subject: ${subjectLine}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : "",
    references ? `References: ${references}` : "",
  ].filter(Boolean);

  let message: string;
  if (attachment) {
    const boundary = `mixed_${Date.now().toString(36)}`;
    const b64 = attachment.content.toString("base64").replace(/(.{76})/g, "$1\r\n");
    message = [
      ...headers,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      `Content-Type: ${bodyHtml ? "text/html" : "text/plain"}; charset="UTF-8"`,
      "",
      bodyHtml || body,
      "",
      `--${boundary}`,
      `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      "",
      b64,
      "",
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    message = [...headers, `Content-Type: ${bodyHtml ? "text/html" : "text/plain"}; charset="UTF-8"`, "", bodyHtml || body].join("\r\n");
  }

  const raw = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId },
  });
  return res.data.id ?? "sent";
}

/**
 * Send a brand-new email (not a thread reply) to an arbitrary recipient, with an
 * optional file attachment. Used by the agent's send_email action.
 */
export async function sendGmailEmail(
  enterpriseId: string,
  opts: { to: string; subject: string; body: string; bodyHtml?: string; cc?: string; attachment?: { filename: string; contentType: string; content: Buffer } },
  ownerUid?: string
): Promise<string> {
  const { client } = await authedClientFor(enterpriseId, ownerUid);
  const gmail = google.gmail({ version: "v1", auth: client });
  const { to, subject, body, bodyHtml, cc, attachment } = opts;

  const headers = [`To: ${to}`, cc ? `Cc: ${cc}` : null, `Subject: ${subject}`, "MIME-Version: 1.0"].filter(Boolean) as string[];

  let message: string;
  if (attachment) {
    const boundary = `mixed_${Date.now().toString(36)}`;
    const b64 = attachment.content.toString("base64").replace(/(.{76})/g, "$1\r\n");
    message = [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      `Content-Type: ${bodyHtml ? "text/html" : "text/plain"}; charset="UTF-8"`,
      "",
      bodyHtml || body,
      "",
      `--${boundary}`,
      `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      "",
      b64,
      "",
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    message = [...headers, `Content-Type: ${bodyHtml ? "text/html" : "text/plain"}; charset="UTF-8"`, "", bodyHtml || body].join("\r\n");
  }

  const raw = Buffer.from(message).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const res = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
  return res.data.id ?? "sent";
}

/** Return an authed OAuth client for a connected enterprise (for API calls). */
export async function authedClientFor(enterpriseId: string, ownerUid?: string) {
  const id = `${enterpriseId}_google-workspace${ownerUid ? `_personal_${ownerUid}` : ""}`;
  const snap = await db.doc(`connections/${id}`).get();
  const { getConnectionSecret } = await import("../connectionSecrets");
  const secret = await getConnectionSecret(enterpriseId, "google-workspace", snap.data(), ownerUid);
  const refresh = secret.refresh_token as string | undefined;
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

function gmailAttachmentParts(payload: any): any[] {
  if (!payload) return [];
  const own = payload.filename && payload.body?.attachmentId ? [payload] : [];
  return [...own, ...(payload.parts ?? []).flatMap((part: any) => gmailAttachmentParts(part))];
}

function parseEmailAddress(from: string): string {
  const m = from.match(/<(.+?)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

/**
 * Sync every connected Google Workspace account. Used by the scheduled auto-sync
 * so users don't have to press a refresh button. One account failing doesn't stop
 * the others. Returns the total number of newly ingested messages.
 */
export async function syncAllConnectedGmail(): Promise<number> {
  const snap = await db.collection("connections").where("type", "==", "google-workspace").get();
  let total = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.status !== "active" || !d.enterprise_id) continue;
    try {
      total += await ingestRecentGmail(d.enterprise_id, 15, d.scope === "personal" ? d.owner_uid : undefined);
    } catch (e) {
      // Non-fatal — keep syncing the rest; a bad/expired token shouldn't block others.
      console.error("scheduled Gmail sync failed", d.enterprise_id, (e as Error).message);
    }
  }
  return total;
}

/**
 * Pull recent inbox messages and normalize them into Firestore
 * (conversations + messages), plus log analytics_events. This is the "read" step.
 */
export async function ingestRecentGmail(enterpriseId: string, max = 15, ownerUid?: string): Promise<number> {
  const { client, accountEmail } = await authedClientFor(enterpriseId, ownerUid);
  const gmail = google.gmail({ version: "v1", auth: client });

  const connectionId = `${enterpriseId}_google-workspace${ownerUid ? `_personal_${ownerUid}` : ""}`;
  const connectionRef = db.doc(`connections/${connectionId}`);
  const connection = (await connectionRef.get()).data();
  const previousIds = new Set<string>((connection?.sync_recent_message_ids as string[] | undefined) ?? []);

  const list = await gmail.users.messages.list({ userId: "me", maxResults: max, q: "in:inbox" });
  const ids = list.data.messages ?? [];
  const currentIds = ids.map((message) => message.id).filter((id): id is string => !!id);
  let count = 0;

  for (const { id } of ids) {
    if (!id) continue;
    // The provider list is newest-first. Once a connection has a cursor, old
    // messages need no Firestore read, provider fetch, or metadata rewrite.
    if (previousIds.has(id)) continue;
    const scopedId = ownerUid ? `${ownerUid}_${id}` : id;
    const msgDocRef = db.doc(`messages/${scopedId}`);
    const alreadyIngested = (await msgDocRef.get()).exists;

    // One transitional check protects messages created before cursors existed.
    // Existing records are never rewritten during normal synchronization.
    if (alreadyIngested) continue;

    const full = await gmail.users.messages.get({ userId: "me", id, format: "full" });
    const payload = full.data.payload;
    const headers = payload?.headers ?? [];

    const from = header(headers, "From");
    const to = header(headers, "To");
    const cc = header(headers, "Cc");
    const subject = header(headers, "Subject");
    const dateStr = header(headers, "Date");
    const fromEmail = parseEmailAddress(from);
    const threadId = full.data.threadId ?? id;
    const senderType = accountEmail && fromEmail.includes(accountEmail) ? "us" : "customer";
    const timestamp = dateStr ? new Date(dateStr) : new Date();

    // Conversation (keyed by Gmail thread)
    const conversationId = `${enterpriseId}_${ownerUid ? `${ownerUid}_` : ""}${threadId}`;
    await db.doc(`conversations/${conversationId}`).set(
      {
        enterprise_id: enterpriseId,
        channel: "google-workspace",
        thread_id: threadId,
        subject: subject || "(no subject)",
        customer_ref: senderType === "customer" ? fromEmail : to,
        account_email: accountEmail,
        status: "open",
        last_message_at: timestamp,
        updated_at: FieldValue.serverTimestamp(),
        connection_scope: ownerUid ? "personal" : "org",
        owner_uid: ownerUid ?? null,
      },
      { merge: true }
    );

    const incoming: IncomingAttachment[] = [];
    for (const part of gmailAttachmentParts(payload)) {
      const fileName = String(part.filename ?? "").trim();
      const declaredSize = Number(part.body?.size ?? 0);
      const contentType = String(part.mimeType ?? "application/octet-stream");
      if (!canAcceptIncomingAttachment(fileName, declaredSize, contentType)) continue;
      const attachmentId = String(part.body.attachmentId);
      const attachmentRes = await gmail.users.messages.attachments.get({ userId: "me", messageId: id, id: attachmentId });
      const encoded = attachmentRes.data.data;
      if (!encoded) continue;
      incoming.push({
        sourceId: attachmentId,
        fileName,
        contentType,
        content: Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
      });
    }
    const attachments = await saveIncomingAttachments({
      enterpriseId,
      channel: "google-workspace",
      messageId: id,
      conversationId,
      senderEmail: fromEmail,
      ownerUid,
      attachments: incoming,
    });

    // Message
    await msgDocRef.set({
      conversation_id: conversationId,
      enterprise_id: enterpriseId,
      channel: "google-workspace",
      gmail_id: id,
      thread_id: threadId,
      sender_type: senderType,
      from,
      from_email: fromEmail,
      to,
      cc: cc || null,
      subject,
      snippet: full.data.snippet ?? "",
      body: extractBody(payload).slice(0, 20000),
      attachments,
      timestamp,
      created_at: FieldValue.serverTimestamp(),
      connection_scope: ownerUid ? "personal" : "org",
      owner_uid: ownerUid ?? null,
    });

    await db.collection("analytics_events").add({
      source: "message",
      workspace_id: enterpriseId,
      payload: { channel: "google-workspace", from: fromEmail, subject, owner_uid: ownerUid ?? null, connection_scope: ownerUid ? "personal" : "org" },
      timestamp: FieldValue.serverTimestamp(),
    });

    count++;
  }

  if (currentIds.join("|") !== [...previousIds].join("|")) {
    await connectionRef.set({ sync_recent_message_ids: currentIds, last_synced_at: FieldValue.serverTimestamp() }, { merge: true });
  }

  return count;
}
