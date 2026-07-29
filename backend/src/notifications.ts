import { db, FieldValue } from "./admin";

export type NotificationKind =
  | "new_message"
  | "approval_required"
  | "action_completed"
  | "action_failed"
  | "access_requested"
  | "access_approved"
  | "access_denied";

type Recipient = { notification_preferences?: Record<string, boolean> };

const preferenceKey: Partial<Record<NotificationKind, string>> = {
  new_message: "newMessage",
  approval_required: "agentApproval",
  action_completed: "actionResult",
  action_failed: "actionResult",
  access_requested: "accessRequest",
  access_approved: "accessRequest",
  access_denied: "accessRequest",
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
  for (const snap of snaps) {
    const data = snap.data() as Recipient | undefined;
    if (!snap.exists || data?.notification_preferences?.[preferenceKey[args.kind] ?? ""] === false) continue;
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
