import { HttpsError } from "firebase-functions/v2/https";
import { db, FieldValue } from "./admin";

/** Persist a per-user read receipt without changing the shared conversation. */
export async function markConversationRead(callerUid: string, args: { conversationId?: string }) {
  const conversationId = String(args.conversationId ?? "").trim();
  if (!conversationId) throw new HttpsError("invalid-argument", "Missing conversation id.");

  const [userSnap, conversationSnap] = await Promise.all([
    db.doc(`users/${callerUid}`).get(),
    db.doc(`conversations/${conversationId}`).get(),
  ]);
  if (!conversationSnap.exists) throw new HttpsError("not-found", "Conversation not found.");

  const enterpriseId = userSnap.data()?.enterprise_id as string | undefined;
  if (!enterpriseId || conversationSnap.data()?.enterprise_id !== enterpriseId) {
    throw new HttpsError("permission-denied", "Conversation belongs to another organization.");
  }

  await db.doc(`conversation_reads/${callerUid}_${conversationId}`).set({
    user_id: callerUid,
    enterprise_id: enterpriseId,
    conversation_id: conversationId,
    read_at: FieldValue.serverTimestamp(),
  });
  return { ok: true, conversationId };
}
