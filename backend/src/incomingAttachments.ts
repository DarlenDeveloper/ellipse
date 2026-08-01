import { createHash, randomUUID } from "crypto";
import * as logger from "firebase-functions/logger";
import { bucket, db, FieldValue } from "./admin";

export const MAX_INCOMING_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_BYTES = 250 * 1024 * 1024;
const MAX_FILES = 10;
const BLOCKED_EXTENSIONS = new Set(["exe", "dll", "bat", "cmd", "com", "msi", "scr", "ps1", "vbs", "jar", "sh"]);
const BLOCKED_MIME = /(?:x-msdownload|x-dosexec|x-executable|x-sh|java-archive)/i;

export type IncomingAttachment = {
  sourceId: string;
  fileName: string;
  contentType: string;
  content: Buffer;
};

export type StoredIncomingAttachment = {
  documentId: string;
  fileName: string;
  contentType: string;
  size: number;
  url: string;
};

export function canAcceptIncomingAttachment(fileName: string, size: number, contentType = ""): boolean {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  return !!fileName && size > 0 && size <= MAX_INCOMING_ATTACHMENT_BYTES
    && !BLOCKED_EXTENSIONS.has(extension) && !BLOCKED_MIME.test(contentType);
}

/** Store safe received-email files in Firebase Storage + Data with stable ids. */
export async function saveIncomingAttachments(opts: {
  enterpriseId: string;
  channel: string;
  messageId: string;
  conversationId: string;
  senderEmail: string;
  ownerUid?: string;
  attachments: IncomingAttachment[];
}): Promise<StoredIncomingAttachment[]> {
  const accepted: IncomingAttachment[] = [];
  let total = 0;
  for (const attachment of opts.attachments) {
    if (accepted.length >= MAX_FILES) break;
    if (!canAcceptIncomingAttachment(attachment.fileName, attachment.content.length, attachment.contentType)) {
      logger.warn("incoming attachment blocked", { channel: opts.channel, fileName: attachment.fileName, size: attachment.content.length });
      continue;
    }
    if (total + attachment.content.length > MAX_TOTAL_BYTES) break;
    accepted.push(attachment);
    total += attachment.content.length;
  }

  const stored: StoredIncomingAttachment[] = [];
  for (const attachment of accepted) {
    const identity = `${opts.enterpriseId}:${opts.channel}:${opts.messageId}:${attachment.sourceId}:${attachment.fileName}`;
    const documentId = `email_attachment_${createHash("sha256").update(identity).digest("hex").slice(0, 32)}`;
    const existing = (await db.doc(`documents/${documentId}`).get()).data();
    if (existing?.enterprise_id === opts.enterpriseId && existing?.file?.url) {
      stored.push({
        documentId,
        fileName: existing.file.name,
        contentType: existing.content_type || attachment.contentType,
        size: existing.file.size || attachment.content.length,
        url: existing.file.url,
      });
      continue;
    }

    const safeName = attachment.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-140) || "attachment";
    const storagePath = `documents/${opts.enterpriseId}/${documentId}/${safeName}`;
    const token = randomUUID();
    await bucket().file(storagePath).save(attachment.content, {
      contentType: attachment.contentType || "application/octet-stream",
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
      resumable: false,
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket().name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
    await db.doc(`documents/${documentId}`).set({
      enterprise_id: opts.enterpriseId,
      title: attachment.fileName,
      kind: "email_attachment",
      file: { name: attachment.fileName, url, type: attachment.contentType || "application/octet-stream", size: attachment.content.length },
      storage_path: storagePath,
      content_type: attachment.contentType || "application/octet-stream",
      source: { system: opts.channel, type: "received_email", message_id: opts.messageId, conversation_id: opts.conversationId, sender_email: opts.senderEmail },
      connection_scope: opts.ownerUid ? "personal" : "org",
      owner_uid: opts.ownerUid ?? null,
      created_at: FieldValue.serverTimestamp(),
    });
    stored.push({ documentId, fileName: attachment.fileName, contentType: attachment.contentType || "application/octet-stream", size: attachment.content.length, url });
  }
  return stored;
}
