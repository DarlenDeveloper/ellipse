import * as logger from "firebase-functions/logger";
import { db } from "./admin";

/**
 * Fully disconnect an integration: remove the connection doc AND purge the data
 * it produced, so nothing lingers (e.g. website analytics after a website is
 * disconnected). Runs server-side with batched deletes.
 */

// channel string stored on messages/conversations for each messaging connection
const CHANNEL: Record<string, string> = {
  "google-workspace": "google-workspace",
  smtp: "smtp",
  microsoft365: "microsoft365",
  whatsapp: "whatsapp",
};

async function deleteDocs(refs: FirebaseFirestore.DocumentReference[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < refs.length; i += 450) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + 450)) batch.delete(ref);
    await batch.commit();
    n += Math.min(450, refs.length - i);
  }
  return n;
}

export async function disconnectIntegration(
  enterpriseId: string,
  type: string
): Promise<{ ok: true; deleted: Record<string, number> }> {
  const deleted: Record<string, number> = {};

  // 1) The connection document itself.
  await db.doc(`connections/${enterpriseId}_${type}`).delete().catch(() => {});

  // 2) Type-specific data.
  if (type === "website") {
    // Tracked sites for this enterprise.
    const sites = await db.collection("web_sites").where("enterprise_id", "==", enterpriseId).get();
    deleted.web_sites = await deleteDocs(sites.docs.map((d) => d.ref));

    // Web analytics events.
    const events = await db.collection("analytics_events").where("workspace_id", "==", enterpriseId).get();
    const webEvents = events.docs.filter((d) => d.data().source === "web");
    deleted.analytics_events = await deleteDocs(webEvents.map((d) => d.ref));
  } else if (CHANNEL[type]) {
    const channel = CHANNEL[type];
    // Conversations + messages on this channel.
    const convs = await db.collection("conversations").where("enterprise_id", "==", enterpriseId).get();
    deleted.conversations = await deleteDocs(convs.docs.filter((d) => d.data().channel === channel).map((d) => d.ref));

    const msgs = await db.collection("messages").where("enterprise_id", "==", enterpriseId).get();
    deleted.messages = await deleteDocs(msgs.docs.filter((d) => d.data().channel === channel).map((d) => d.ref));

    // Ingest analytics events for this channel.
    const events = await db.collection("analytics_events").where("workspace_id", "==", enterpriseId).get();
    const chEvents = events.docs.filter(
      (d) => d.data().source === "message" && (d.data().payload as { channel?: string })?.channel === channel
    );
    deleted.analytics_events = await deleteDocs(chEvents.map((d) => d.ref));
  } else if (type === "zoho") {
    // Backfilled CRM records mirrored into analytics.
    const events = await db.collection("analytics_events").where("workspace_id", "==", enterpriseId).get();
    const zohoEvents = events.docs.filter((d) => d.data().source === "zoho_record");
    deleted.analytics_events = await deleteDocs(zohoEvents.map((d) => d.ref));
  }

  logger.info("disconnectIntegration purged data", { enterpriseId, type, deleted });
  return { ok: true, deleted };
}
