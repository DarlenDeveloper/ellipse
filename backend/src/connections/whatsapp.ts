import { db, FieldValue } from "../admin";

/**
 * WhatsApp Business Cloud API connection.
 *
 * No OAuth: the enterprise supplies a Phone Number ID + access token (from the
 * Meta app's WhatsApp → API Setup). Inbound messages arrive via a webhook Meta
 * calls; we send via the Graph API.
 *
 * One webhook serves all enterprises — inbound payloads carry the phone_number_id,
 * which we map back to the owning connection.
 *
 * NOTE (security debt, same as SMTP/Gmail): the access token is stored in
 * Firestore for now. TODO: Secret Manager before production.
 */

const GRAPH_VERSION = "v21.0";

type WhatsAppConfig = {
  phone_number_id: string;
  waba_id?: string;
  access_token: string;
  display_phone_number?: string;
};

function connDoc(enterpriseId: string) {
  return db.doc(`connections/${enterpriseId}_whatsapp`);
}

/** Verify the phone number id + access token work by calling the Graph API. */
export async function testWhatsappConnection(cfg: WhatsAppConfig): Promise<void> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.phone_number_id}?fields=display_phone_number`,
    { headers: { Authorization: `Bearer ${cfg.access_token}` } }
  );
  const data = (await res.json()) as any;
  if (data.error) throw new Error(data.error.message ?? "invalid credentials");
}

/** Persist the WhatsApp connection config. Omits empty optional fields (Firestore rejects undefined). */
export async function saveWhatsappConnection(
  enterpriseId: string,
  cfg: WhatsAppConfig
): Promise<void> {
  const doc: Record<string, unknown> = {
    enterprise_id: enterpriseId,
    type: "whatsapp",
    auth_type: "token",
    status: "active",
    account_email: cfg.display_phone_number || cfg.phone_number_id,
    phone_number_id: cfg.phone_number_id,
    access_token: cfg.access_token,
    connected_at: FieldValue.serverTimestamp(),
  };
  if (cfg.waba_id) doc.waba_id = cfg.waba_id;
  if (cfg.display_phone_number) doc.display_phone_number = cfg.display_phone_number;

  await connDoc(enterpriseId).set(doc, { merge: true });
}

/** Find which enterprise owns a given WhatsApp phone number id. */
async function enterpriseForPhoneNumber(phoneNumberId: string): Promise<{ enterpriseId: string; access_token: string } | null> {
  const snap = await db
    .collection("connections")
    .where("type", "==", "whatsapp")
    .where("phone_number_id", "==", phoneNumberId)
    .get();
  const doc = snap.docs[0];
  if (!doc) return null;
  const d = doc.data();
  return { enterpriseId: d.enterprise_id, access_token: d.access_token };
}

async function loadConfig(enterpriseId: string): Promise<WhatsAppConfig> {
  const snap = await connDoc(enterpriseId).get();
  const d = snap.data() as WhatsAppConfig | undefined;
  if (!d?.phone_number_id) throw new Error("whatsapp not connected");
  return d;
}

/**
 * Handle an inbound webhook payload from Meta — normalize any messages into
 * Firestore (conversations + messages) + analytics_events. Mirrors the other
 * channels so the unified inbox is consistent.
 */
export async function handleInboundWebhook(body: any): Promise<number> {
  let count = 0;
  const entries = body?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const owner = await enterpriseForPhoneNumber(phoneNumberId);
      if (!owner) continue;
      const enterpriseId = owner.enterpriseId;

      const contacts = value.contacts ?? [];
      const contactName = contacts[0]?.profile?.name ?? "";

      for (const m of value.messages ?? []) {
        const waId = m.from; // customer phone number
        const messageId = m.id;
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.list_reply?.title ?? "(unsupported message type)";
        const timestamp = m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date();

        const docId = `wa_${messageId}`;
        const msgDocRef = db.doc(`messages/${docId}`);
        if ((await msgDocRef.get()).exists) continue;

        const convId = `${enterpriseId}_wa_${waId}`;
        await db.doc(`conversations/${convId}`).set(
          {
            enterprise_id: enterpriseId,
            channel: "whatsapp",
            thread_id: waId,
            subject: contactName ? `WhatsApp: ${contactName}` : `WhatsApp: ${waId}`,
            customer_ref: waId,
            status: "open",
            last_message_at: timestamp,
            updated_at: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        await msgDocRef.set({
          conversation_id: convId,
          enterprise_id: enterpriseId,
          channel: "whatsapp",
          thread_id: waId,
          message_id: messageId,
          sender_type: "customer",
          from: contactName || waId,
          from_email: waId, // reuse field: holds the phone number
          subject: "",
          snippet: text.slice(0, 200),
          body: text,
          timestamp,
          created_at: FieldValue.serverTimestamp(),
        });

        await db.collection("analytics_events").add({
          source: "message",
          workspace_id: enterpriseId,
          payload: { channel: "whatsapp", from: waId },
          timestamp: FieldValue.serverTimestamp(),
        });

        count++;
      }
    }
  }
  return count;
}

/** Send a WhatsApp text message. Returns the message id. */
export async function sendWhatsAppMessage(
  enterpriseId: string,
  to: string,
  text: string
): Promise<string> {
  const cfg = await loadConfig(enterpriseId);
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${cfg.phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    }
  );
  const data = (await res.json()) as any;
  if (data.error) throw new Error(`WhatsApp send failed: ${data.error.message}`);
  return data.messages?.[0]?.id ?? "sent";
}
