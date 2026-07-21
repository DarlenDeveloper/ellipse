import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { db } from "./admin";

const geminiKey = defineSecret("GEMINI_API_KEY");
const googleClientId = defineSecret("GOOGLE_OAUTH_CLIENT_ID");
const googleClientSecret = defineSecret("GOOGLE_OAUTH_CLIENT_SECRET");
const zohoClientId = defineSecret("ZOHO_CLIENT_ID");
const zohoClientSecret = defineSecret("ZOHO_CLIENT_SECRET");
const msClientId = defineSecret("MS_CLIENT_ID");
const msClientSecret = defineSecret("MS_CLIENT_SECRET");

/**
 * Auto-runs the connection agents when a new inbound (customer) message lands.
 *
 * This is what makes the system hands-off: ingestion creates a message doc, this
 * trigger fires, and the relevant agents run according to workspace mode:
 *   - off          → do nothing (analytics already logged at ingest)
 *   - supervised   → agents suggest (writes pending_actions)
 *   - unsupervised → agents act immediately
 *
 * Only fires for sender_type "customer", so our own sent/synced replies don't
 * re-trigger it (no loops).
 */
export const onMessageCreated = onDocumentCreated(
  {
    document: "messages/{id}",
    secrets: [geminiKey, googleClientId, googleClientSecret, zohoClientId, zohoClientSecret, msClientId, msClientSecret],
  },
  async (event) => {
    const msg = event.data?.data();
    if (!msg) return;
    if (msg.sender_type !== "customer") return;

    const enterpriseId = msg.enterprise_id as string | undefined;
    const conversationId = msg.conversation_id as string | undefined;
    if (!enterpriseId || !conversationId) return;

    // Respect workspace mode — Off means no agents run at all.
    const entSnap = await db.doc(`enterprises/${enterpriseId}`).get();
    const mode = (entSnap.data()?.mode as string) ?? "supervised";
    if (mode === "off") {
      logger.info("onMessageCreated: mode off, skipping agents", { enterpriseId });
      return;
    }

    // Dispatch to the connection's own agent based on the message channel.
    try {
      const channel = msg.channel as string | undefined;
      if (channel === "google-workspace") {
        const { runGmailAgent } = await import("./agents/gmailAgent");
        await runGmailAgent(enterpriseId, conversationId);
      } else if (channel === "smtp") {
        const { runSmtpAgent } = await import("./agents/smtpAgent");
        await runSmtpAgent(enterpriseId, conversationId);
      } else if (channel === "microsoft365") {
        const { runMicrosoftAgent } = await import("./agents/microsoftAgent");
        await runMicrosoftAgent(enterpriseId, conversationId);
      } else if (channel === "whatsapp") {
        const { runWhatsappAgent } = await import("./agents/whatsappAgent");
        await runWhatsappAgent(enterpriseId, conversationId);
      }
    } catch (e) {
      logger.error("onMessageCreated: channel agent failed", { conversationId, error: (e as Error).message });
    }

    // Zoho agent → CRM enrich/update — only if Zoho is connected.
    try {
      const zohoConn = await db.doc(`connections/${enterpriseId}_zoho`).get();
      if (zohoConn.exists && zohoConn.data()?.status === "active") {
        const { runZohoAgent } = await import("./agents/zohoAgent");
        await runZohoAgent(enterpriseId, conversationId);
      }
    } catch (e) {
      logger.error("onMessageCreated: zoho agent failed", { conversationId, error: (e as Error).message });
    }
  }
);
