import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { db, FieldValue } from "../admin";

/**
 * SMTP/IMAP connection — for any custom email server.
 *
 * Unlike Gmail (OAuth), this uses plain host/port + username/password the user
 * supplies. IMAP reads inbound mail into the unified inbox; SMTP sends replies.
 *
 * NOTE (security debt, same as Gmail refresh token): credentials are stored in
 * Firestore for now. TODO: move to Secret Manager before production.
 */

type SmtpConfig = {
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  username: string;
  password: string;
  from_email?: string;
};

function connDoc(enterpriseId: string) {
  return db.doc(`connections/${enterpriseId}_smtp`);
}

/** Persist the connection config after a successful connection test. */
export async function saveSmtpConnection(enterpriseId: string, cfg: SmtpConfig): Promise<void> {
  await connDoc(enterpriseId).set(
    {
      enterprise_id: enterpriseId,
      type: "smtp",
      auth_type: "password",
      status: "active",
      account_email: cfg.from_email || cfg.username,
      ...cfg,
      connected_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function loadConfig(enterpriseId: string): Promise<SmtpConfig> {
  const snap = await connDoc(enterpriseId).get();
  const d = snap.data() as SmtpConfig | undefined;
  if (!d?.imap_host) throw new Error("smtp not connected");
  return d;
}

/** Verify IMAP + SMTP credentials work. Throws on failure. */
export async function testSmtpConnection(cfg: SmtpConfig): Promise<void> {
  const client = new ImapFlow({
    host: cfg.imap_host,
    port: Number(cfg.imap_port),
    secure: Number(cfg.imap_port) === 993,
    auth: { user: cfg.username, pass: cfg.password },
    logger: false,
  });
  await client.connect();
  await client.logout();

  const transport = nodemailer.createTransport({
    host: cfg.smtp_host,
    port: Number(cfg.smtp_port),
    secure: Number(cfg.smtp_port) === 465,
    auth: { user: cfg.username, pass: cfg.password },
  });
  await transport.verify();
}

function parseEmailAddress(from: string): string {
  const m = from.match(/<(.+?)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

/**
 * Pull recent INBOX messages via IMAP into Firestore (conversations + messages)
 * + analytics_events. Mirrors the Gmail ingest shape so the inbox is uniform.
 */
export async function ingestRecentImap(enterpriseId: string, max = 15): Promise<number> {
  const cfg = await loadConfig(enterpriseId);
  const account = (cfg.from_email || cfg.username).toLowerCase();

  const client = new ImapFlow({
    host: cfg.imap_host,
    port: Number(cfg.imap_port),
    secure: Number(cfg.imap_port) === 993,
    auth: { user: cfg.username, pass: cfg.password },
    logger: false,
  });

  await client.connect();
  let count = 0;
  const lock = await client.getMailboxLock("INBOX");
  try {
    const status = await client.status("INBOX", { messages: true });
    const total = status.messages ?? 0;
    if (total === 0) return 0;
    const start = Math.max(1, total - max + 1);

    for await (const msg of client.fetch(`${start}:*`, {
      envelope: true,
      source: true,
      uid: true,
    })) {
      const env = msg.envelope;
      const messageId = env?.messageId || `smtp_${msg.uid}`;
      const docId = `smtp_${enterpriseId}_${Buffer.from(messageId).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 60)}`;
      const msgDocRef = db.doc(`messages/${docId}`);
      if ((await msgDocRef.get()).exists) continue;

      const fromAddr = env?.from?.[0];
      const from = fromAddr ? `${fromAddr.name ?? ""} <${fromAddr.address ?? ""}>`.trim() : "";
      const fromEmail = (fromAddr?.address ?? "").toLowerCase();
      const subject = env?.subject ?? "(no subject)";
      const timestamp = env?.date ? new Date(env.date) : new Date();
      const threadId = messageId;
      const senderType = fromEmail === account ? "us" : "customer";
      const body = msg.source ? msg.source.toString("utf-8").slice(0, 20000) : "";

      await db.doc(`conversations/${enterpriseId}_${docId}`).set(
        {
          enterprise_id: enterpriseId,
          channel: "smtp",
          thread_id: threadId,
          subject,
          customer_ref: senderType === "customer" ? fromEmail : account,
          status: "open",
          last_message_at: timestamp,
          updated_at: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await msgDocRef.set({
        conversation_id: `${enterpriseId}_${docId}`,
        enterprise_id: enterpriseId,
        channel: "smtp",
        thread_id: threadId,
        message_id: messageId,
        sender_type: senderType,
        from,
        from_email: fromEmail,
        subject,
        snippet: body.slice(0, 200),
        body,
        timestamp,
        created_at: FieldValue.serverTimestamp(),
      });

      await db.collection("analytics_events").add({
        source: "message",
        workspace_id: enterpriseId,
        payload: { channel: "smtp", from: fromEmail, subject },
        timestamp: FieldValue.serverTimestamp(),
      });

      count++;
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return count;
}

/** Sync every connected SMTP account (used by scheduled auto-sync). */
export async function syncAllConnectedImap(): Promise<number> {
  const snap = await db.collection("connections").where("type", "==", "smtp").get();
  let total = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.status !== "active" || !d.enterprise_id) continue;
    try {
      total += await ingestRecentImap(d.enterprise_id);
    } catch (e) {
      console.error("scheduled IMAP sync failed", d.enterprise_id, (e as Error).message);
    }
  }
  return total;
}

/** Send a reply via SMTP. Returns the sent message id. */
export async function sendSmtpReply(
  enterpriseId: string,
  to: string,
  subject: string,
  body: string
): Promise<string> {
  const cfg = await loadConfig(enterpriseId);
  const transport = nodemailer.createTransport({
    host: cfg.smtp_host,
    port: Number(cfg.smtp_port),
    secure: Number(cfg.smtp_port) === 465,
    auth: { user: cfg.username, pass: cfg.password },
  });

  const subjectLine = subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
  const info = await transport.sendMail({
    from: cfg.from_email || cfg.username,
    to,
    subject: subjectLine,
    text: body,
  });
  return info.messageId ?? "sent";
}
