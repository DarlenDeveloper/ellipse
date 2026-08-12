import { db, FieldValue } from "./admin";
import { getMessaging } from "firebase-admin/messaging";
import { createHash } from "crypto";
import * as logger from "firebase-functions/logger";

export type NotificationKind =
  | "new_message"
  | "approval_required"
  | "action_completed"
  | "action_failed"
  | "access_requested"
  | "access_approved"
  | "access_denied"
  | "internal_message"
  | "daily_report";

type Recipient = { notification_preferences?: Record<string, boolean> };

const preferenceKey: Partial<Record<NotificationKind, string>> = {
  new_message: "newMessage",
  approval_required: "agentApproval",
  action_completed: "actionResult",
  action_failed: "actionResult",
  access_requested: "accessRequest",
  access_approved: "accessRequest",
  access_denied: "accessRequest",
  // Team chat is independently configurable. Reusing newMessage meant users
  // who disabled inbox alerts also lost internal messages without realizing it.
  internal_message: "teamChat",
  daily_report: "dailyReport",
};

export async function notifyUsers(args: {
  enterpriseId: string;
  recipientUids: string[];
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string;
  entityId?: string;
}) {
  const unique = Array.from(new Set(args.recipientUids.filter(Boolean)));
  if (!unique.length) return;
  const snaps = await Promise.all(unique.map((uid) => db.doc(`users/${uid}`).get()));
  const batch = db.batch();
  const deliveredUids: string[] = [];
  for (const snap of snaps) {
    const data = snap.data() as Recipient | undefined;
    if (!snap.exists || data?.notification_preferences?.[preferenceKey[args.kind] ?? ""] === false) continue;
    deliveredUids.push(snap.id);
    const ref = db.collection("notifications").doc();
    batch.set(ref, {
      enterprise_id: args.enterpriseId,
      recipient_uid: snap.id,
      kind: args.kind,
      title: args.title,
      body: args.body,
      href: args.href ?? null,
      entity_id: args.entityId ?? null,
      read: false,
      created_at: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  if (!deliveredUids.length) return;
  try {
    // Firestore `in` queries accept a limited number of values. Query every
    // recipient chunk so chats in larger organisations do not silently omit
    // users after the first chunk.
    const tokenDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    for (let offset = 0; offset < deliveredUids.length && tokenDocs.length < 500; offset += 30) {
      const tokenSnap = await db.collection("push_tokens")
        .where("user_uid", "in", deliveredUids.slice(offset, offset + 30)).get();
      tokenDocs.push(...tokenSnap.docs.filter((doc) => Boolean(doc.data().token)));
    }
    tokenDocs.splice(500);
    const tokens = tokenDocs.map((doc) => String(doc.data().token));
    if (tokens.length) {
      const response = await getMessaging().sendEachForMulticast({
        tokens,
        notification: { title: args.title, body: args.body },
        data: { href: args.href ?? "/dashboard", kind: args.kind, entityId: args.entityId ?? "" },
        webpush: { fcmOptions: { link: `https://crm.mercurycomputerslimited.com${args.href ?? "/dashboard"}` } },
      });
      const invalid = response.responses.flatMap((result, index) => {
        const code = result.error?.code;
        return !result.success && (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token")
          ? [tokenDocs[index]?.ref]
          : [];
      }).filter(Boolean) as FirebaseFirestore.DocumentReference[];
      if (invalid.length) {
        const cleanup = db.batch();
        invalid.forEach((ref) => cleanup.delete(ref));
        await cleanup.commit();
      }
    }
  } catch (error) {
    // Push is a secondary channel; it must never break the underlying action.
    logger.error("Push notification delivery failed", { error: (error as Error).message, kind: args.kind });
  }
}

export async function registerPushToken(uid: string, token: string, enterpriseId: string, userAgent?: string) {
  const id = createHash("sha256").update(token).digest("hex");
  await db.doc(`push_tokens/${id}`).set({
    token,
    user_uid: uid,
    enterprise_id: enterpriseId,
    user_agent: (userAgent ?? "").slice(0, 300),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function unregisterPushToken(uid: string, token: string) {
  const id = createHash("sha256").update(token).digest("hex");
  const ref = db.doc(`push_tokens/${id}`);
  const snap = await ref.get();
  if (snap.data()?.user_uid === uid) await ref.delete();
}

export async function notificationRecipients(enterpriseId: string, mode: "members" | "managers" | "approvers") {
  const snap = await db.collection("users").where("enterprise_id", "==", enterpriseId).get();
  return snap.docs
    .filter((doc) => {
      const user = doc.data();
      if ((user.status ?? "active") === "disabled") return false;
      const manager = user.role === "owner" || user.role === "admin";
      if (mode === "members") return true;
      return mode === "managers" ? manager : manager || user.can_approve === true;
    })
    .map((doc) => doc.id);
}
