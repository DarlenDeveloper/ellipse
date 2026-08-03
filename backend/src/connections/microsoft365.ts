import { createHash } from "crypto";
import { db, FieldValue } from "../admin";
import { canAcceptIncomingAttachment, saveIncomingAttachments, type IncomingAttachment } from "../incomingAttachments";

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

// Scopes: profile + Outlook mail (read/write/send) now, and Files.ReadWrite
// requested up-front so file creation (later) needs no re-consent.
const SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "Files.ReadWrite",
];

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

function sanitizeId(id: string): string {
  // Full-id hash — Outlook ids share a long common prefix, so slicing collided.
  return createHash("sha256").update(id).digest("hex").slice(0, 40);
}

/**
 * Pull recent Outlook inbox messages into the unified inbox
 * (conversations + messages + analytics_events, channel "microsoft365").
 * Mirrors the Gmail ingest so the inbox stays uniform.
 */
export async function ingestRecentOutlook(enterpriseId: string, max = 15): Promise<number> {
  const token = await authedTokenFor(enterpriseId);
  const connectionRef = connDoc(enterpriseId);
  const snap = await connectionRef.get();
  const account = (snap.data()?.account_email as string | undefined)?.toLowerCase() ?? "";
  const previousIds = new Set<string>((snap.data()?.sync_recent_message_ids as string[] | undefined) ?? []);

  const url =
    `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages` +
    `?$top=${max}&$select=id,conversationId,subject,from,toRecipients,ccRecipients,bodyPreview,body,receivedDateTime,hasAttachments&$orderby=receivedDateTime desc`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = (await res.json()) as any;
  if (data.error) throw new Error(data.error.message);

  const messages: any[] = data.value ?? [];
  const currentIds = messages.map((message) => String(message.id ?? "")).filter(Boolean);
  let count = 0;
  const stamped = new Set<string>();

  for (const m of messages) {
    if (previousIds.has(String(m.id))) continue;
    const docId = `ms_${sanitizeId(m.id)}`;
    const msgRef = db.doc(`messages/${docId}`);
    const alreadyIngested = (await msgRef.get()).exists;
    if (alreadyIngested) continue;

    const fromEmail = (m.from?.emailAddress?.address ?? "").toLowerCase();
    const fromName = m.from?.emailAddress?.name ?? fromEmail;
    const toEmail = (m.toRecipients?.[0]?.emailAddress?.address ?? "").toLowerCase();
    const to = (m.toRecipients ?? []).map((recipient: any) => recipient.emailAddress?.address).filter(Boolean).join(", ");
    const cc = (m.ccRecipients ?? []).map((recipient: any) => recipient.emailAddress?.address).filter(Boolean).join(", ");
    const convGraphId = m.conversationId ?? m.id;
    const convId = `${enterpriseId}_ms_${sanitizeId(convGraphId)}`;
    const senderType = account && fromEmail === account ? "us" : "customer";
    const timestamp = m.receivedDateTime ? new Date(m.receivedDateTime) : new Date();

    const convPatch: Record<string, unknown> = {
      enterprise_id: enterpriseId,
      channel: "microsoft365",
      thread_id: convGraphId,
      subject: m.subject || "(no subject)",
      customer_ref: senderType === "customer" ? fromEmail : toEmail,
      account_email: account,
      status: "open",
      last_message_at: timestamp,
      updated_at: FieldValue.serverTimestamp(),
    };
    // Stamp the newest inbound message id (we iterate newest-first) for replies.
    if (senderType === "customer" && !stamped.has(convId)) {
      convPatch.outlook_last_message_id = m.id;
      stamped.add(convId);
    }
    await db.doc(`conversations/${convId}`).set(convPatch, { merge: true });

    const incoming: IncomingAttachment[] = [];
    if (m.hasAttachments) {
      const attachmentRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(m.id)}/attachments?$select=id,name,contentType,size,isInline`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const attachmentData = (await attachmentRes.json()) as any;
      if (!attachmentRes.ok) throw new Error(attachmentData?.error?.message || "Outlook attachments could not be read");
      for (const attachment of attachmentData.value ?? []) {
        if (attachment.isInline || !canAcceptIncomingAttachment(attachment.name, Number(attachment.size), attachment.contentType)) continue;
        const fileRes = await fetch(
          `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(m.id)}/attachments/${encodeURIComponent(attachment.id)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const file = (await fileRes.json()) as any;
        if (!fileRes.ok) throw new Error(file?.error?.message || "Outlook attachment could not be downloaded");
        if (file.contentBytes) incoming.push({
          sourceId: attachment.id,
          fileName: attachment.name,
          contentType: attachment.contentType || "application/octet-stream",
          content: Buffer.from(file.contentBytes, "base64"),
        });
      }
    }
    const attachments = await saveIncomingAttachments({
      enterpriseId,
      channel: "microsoft365",
      messageId: m.id,
      conversationId: convId,
      senderEmail: fromEmail,
      attachments: incoming,
    });

    await msgRef.set({
      conversation_id: convId,
      enterprise_id: enterpriseId,
      channel: "microsoft365",
      thread_id: convGraphId,
      message_id: m.id,
      sender_type: senderType,
      from: fromName,
      from_email: fromEmail,
      to,
      cc: cc || null,
      subject: m.subject ?? "",
      snippet: m.bodyPreview ?? "",
      body: (m.body?.content ?? m.bodyPreview ?? "").slice(0, 20000),
      attachments,
      timestamp,
      created_at: FieldValue.serverTimestamp(),
    });

    await db.collection("analytics_events").add({
      source: "message",
      workspace_id: enterpriseId,
      payload: { channel: "microsoft365", from: fromEmail, subject: m.subject },
      timestamp: FieldValue.serverTimestamp(),
    });

    count++;
  }
  if (currentIds.join("|") !== [...previousIds].join("|")) {
    await connectionRef.set({ sync_recent_message_ids: currentIds, last_synced_at: FieldValue.serverTimestamp() }, { merge: true });
  }
  return count;
}

/** Sync every connected Outlook account (used by scheduled auto-sync). */
export async function syncAllConnectedOutlook(): Promise<number> {
  const snap = await db.collection("connections").where("type", "==", "microsoft365").get();
  let total = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.status !== "active" || !d.enterprise_id) continue;
    try {
      total += await ingestRecentOutlook(d.enterprise_id);
    } catch (e) {
      console.error("scheduled Outlook sync failed", d.enterprise_id, (e as Error).message);
    }
  }
  return total;
}

/**
 * Reply within an Outlook conversation. Uses the reply endpoint on the latest
 * inbound message (proper threading); falls back to a fresh sendMail.
 */
export async function sendOutlookReply(
  enterpriseId: string,
  opts: { conversationId?: string; to?: string; subject?: string; body: string; cc?: string; attachment?: { filename: string; contentType: string; content: Buffer } }
): Promise<string> {
  const token = await authedTokenFor(enterpriseId);

  let messageId: string | undefined;
  if (opts.conversationId) {
    const conv = await db.doc(`conversations/${opts.conversationId}`).get();
    messageId = conv.data()?.outlook_last_message_id as string | undefined;
  }

  if (messageId) {
    if (opts.attachment || opts.cc) {
      if (opts.attachment && opts.attachment.content.length > 3 * 1024 * 1024) {
        throw new Error("Outlook reply attachments over 3 MB require an upload session.");
      }
      const draftRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}/createReply`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ comment: opts.body }),
        }
      );
      const draft = (await draftRes.json()) as any;
      if (!draftRes.ok || !draft.id) throw new Error(draft?.error?.message || "Outlook could not create the reply draft");
      if (opts.cc) {
        const patchRes = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draft.id)}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ccRecipients: opts.cc.split(",").map((address) => ({ emailAddress: { address: address.trim() } })).filter((recipient) => recipient.emailAddress.address) }),
        });
        if (!patchRes.ok) throw new Error("Outlook could not add the CC recipients");
      }
      if (opts.attachment) {
        const attachRes = await fetch(
          `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draft.id)}/attachments`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: opts.attachment.filename,
              contentType: opts.attachment.contentType,
              contentBytes: opts.attachment.content.toString("base64"),
            }),
          }
        );
        if (!attachRes.ok) {
          const error = (await attachRes.json()) as any;
          throw new Error(error?.error?.message || "Outlook could not attach the file");
        }
      }
      const sendRes = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draft.id)}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (sendRes.status !== 202) throw new Error("Outlook could not send the reply draft");
      return opts.attachment ? "replied-with-attachment" : "replied-with-cc";
    }
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}/reply`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ comment: opts.body }),
      }
    );
    if (res.status === 202) return "replied";
    const d = (await res.json()) as any;
    if (d?.error) throw new Error(d.error.message);
    return "replied";
  }

  // Fallback: brand-new message.
  return sendOutlookEmail(enterpriseId, {
    to: opts.to ?? "",
    subject: opts.subject?.toLowerCase().startsWith("re:") ? opts.subject : `Re: ${opts.subject ?? ""}`,
    body: opts.body,
    cc: opts.cc,
    attachment: opts.attachment,
  });
}

/**
 * Send a brand-new Outlook email to an arbitrary recipient, with an optional
 * attachment. Used by the agent's send_email action.
 */
export async function sendOutlookEmail(
  enterpriseId: string,
  opts: { to: string; subject: string; body: string; cc?: string; attachment?: { filename: string; contentType: string; content: Buffer } }
): Promise<string> {
  const token = await authedTokenFor(enterpriseId);
  const message: Record<string, unknown> = {
    subject: opts.subject,
    body: { contentType: "Text", content: opts.body },
    toRecipients: [{ emailAddress: { address: opts.to } }],
    ccRecipients: opts.cc ? [{ emailAddress: { address: opts.cc } }] : [],
  };
  if (opts.attachment) {
    message.attachments = [
      {
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: opts.attachment.filename,
        contentType: opts.attachment.contentType,
        contentBytes: opts.attachment.content.toString("base64"),
      },
    ];
  }
  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (res.status === 202) return "sent";
  const d = (await res.json()) as any;
  if (d?.error) throw new Error(d.error.message);
  return "sent";
}

/**
 * Upload a file to the connected account's OneDrive (simple upload, < 4 MB).
 * Used to store agent-generated reports (Word/Excel) in Microsoft 365 so they
 * live alongside the customer's other business documents. Returns the driveItem
 * id + a shareable webUrl.
 */
export async function uploadFileToOneDrive(
  enterpriseId: string,
  folder: string,
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<{ id: string; webUrl: string }> {
  const token = await authedTokenFor(enterpriseId);
  const path = `${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      body: buffer,
    }
  );
  const d = (await res.json()) as any;
  if (d?.error) throw new Error(d.error.message);
  return { id: d.id, webUrl: d.webUrl };
}

/** Is Microsoft 365 connected + active for this enterprise? */
export async function isMicrosoftConnected(enterpriseId: string): Promise<boolean> {
  const snap = await connDoc(enterpriseId).get();
  return snap.exists && snap.data()?.status === "active";
}

/** Verify the connection + peek at the inbox to diagnose ingestion. */
export async function verifyConnection(
  enterpriseId: string
): Promise<{ ok: boolean; email?: string; error?: string; inbox?: any }> {
  try {
    const token = await authedTokenFor(enterpriseId);
    const me = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = (await me.json()) as any;
    if (d.error) return { ok: false, error: d.error.message };

    // Peek at the inbox so we can see what Graph actually returns.
    const inboxRes = await fetch(
      "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=10&$select=id,subject,from,receivedDateTime&$orderby=receivedDateTime desc",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const inboxData = (await inboxRes.json()) as any;
    const inbox = inboxData.error
      ? { error: inboxData.error.message }
      : {
          count: (inboxData.value ?? []).length,
          subjects: (inboxData.value ?? []).map((m: any) => ({
            subject: m.subject,
            from: m.from?.emailAddress?.address,
            at: m.receivedDateTime,
          })),
        };

    return { ok: true, email: d.mail || d.userPrincipalName, inbox };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
