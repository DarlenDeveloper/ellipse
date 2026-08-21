import { db, FieldValue } from "./admin";
import { getMessaging } from "firebase-admin/messaging";
import { createHash } from "crypto";
import * as logger from "firebase-functions/logger";

export type NotificationKind =
  | "test"
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
type DeviceToken = {
  ref: FirebaseFirestore.DocumentReference;
  token: string;
  platform?: string;
};

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
    const nestedSnapshots = await Promise.all(
      deliveredUids.map((uid) => db.collection(`users/${uid}/push_tokens`).get())
    );
    const devices: DeviceToken[] = nestedSnapshots.flatMap((snap) => snap.docs.map((doc) => ({
      ref: doc.ref,
      token: String(doc.data().token ?? ""),
      platform: String(doc.data().platform ?? "unknown"),
    }))).filter((device) => Boolean(device.token));

    // Temporary migration fallback: include tokens written by older web/mobile
    // builds until each device refreshes into users/{uid}/push_tokens.
    for (let offset = 0; offset < deliveredUids.length && devices.length < 500; offset += 30) {
      const legacy = await db.collection("push_tokens")
        .where("user_uid", "in", deliveredUids.slice(offset, offset + 30)).get();
      for (const doc of legacy.docs) {
        const token = String(doc.data().token ?? "");
        if (token && !devices.some((device) => device.token === token)) {
          devices.push({ ref: doc.ref, token, platform: String(doc.data().platform ?? "legacy") });
        }
      }
    }
    devices.splice(500);
    const tokens = devices.map((device) => device.token);
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
          ? [devices[index]?.ref]
          : [];
      }).filter(Boolean) as FirebaseFirestore.DocumentReference[];
      if (invalid.length) {
        const cleanup = db.batch();
        invalid.forEach((ref) => cleanup.delete(ref));
        await cleanup.commit();
      }
      logger.info("Push notification delivery complete", {
        kind: args.kind,
        recipients: deliveredUids.length,
        devices: tokens.length,
        success: response.successCount,
        failed: response.failureCount,
        platforms: devices.reduce<Record<string, number>>((counts, device) => {
          const platform = device.platform || "unknown";
          counts[platform] = (counts[platform] ?? 0) + 1;
          return counts;
        }, {}),
        errors: response.responses
          .map((result) => result.error?.code)
          .filter((code): code is string => Boolean(code)),
      });
    } else {
      logger.warn("Push notification skipped: recipients have no registered devices", {
        kind: args.kind,
        recipients: deliveredUids.length,
      });
    }
  } catch (error) {
    // Push is a secondary channel; it must never break the underlying action.
    logger.error("Push notification delivery failed", { error: (error as Error).message, kind: args.kind });
  }
}

export async function registerPushToken(
  uid: string,
  token: string,
  enterpriseId: string,
  platform = "unknown",
  userAgent?: string
) {
  const id = createHash("sha256").update(token).digest("hex");
  const batch = db.batch();
  batch.set(db.doc(`users/${uid}/push_tokens/${id}`), {
    token,
    user_uid: uid,
    enterprise_id: enterpriseId,
    platform: platform.slice(0, 30),
    user_agent: (userAgent ?? "").slice(0, 300),
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  // Remove the old global copy after the user-owned device document is queued.
  batch.delete(db.doc(`push_tokens/${id}`));
  await batch.commit();
  logger.info("Push token registered", { uid, platform, tokenId: id.slice(0, 12) });
}

export async function unregisterPushToken(uid: string, token: string) {
  const id = createHash("sha256").update(token).digest("hex");
  const nestedRef = db.doc(`users/${uid}/push_tokens/${id}`);
  const legacyRef = db.doc(`push_tokens/${id}`);
  const legacy = await legacyRef.get();
  const batch = db.batch();
  batch.delete(nestedRef);
  if (legacy.data()?.user_uid === uid) batch.delete(legacyRef);
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
