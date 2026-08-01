import { HttpsError } from "firebase-functions/v2/https";
import { db, FieldValue } from "./admin";
import { notifyUsers } from "./notifications";

type Member = { uid: string; enterpriseId: string; name: string; email: string; status: string };

async function loadMember(uid: string): Promise<Member> {
  const snap = await db.doc(`users/${uid}`).get();
  const data = snap.data();
  if (!snap.exists || !data?.enterprise_id || (data.status && data.status !== "active")) {
    throw new HttpsError("permission-denied", "You are not an active organization member.");
  }
  return {
    uid,
    enterpriseId: data.enterprise_id as string,
    name: (data.display_name as string) || (data.email as string) || "Member",
    email: (data.email as string) || "",
    status: (data.status as string) || "active",
  };
}

function groupId(enterpriseId: string) {
  return `team_${enterpriseId}`;
}

function directId(enterpriseId: string, firstUid: string, secondUid: string) {
  return `direct_${enterpriseId}_${[firstUid, secondUid].sort().join("_")}`;
}

async function activeMemberUids(enterpriseId: string) {
  const snap = await db.collection("users").where("enterprise_id", "==", enterpriseId).get();
  return snap.docs
    .filter((item) => (item.data().status ?? "active") === "active")
    .map((item) => item.id);
}

/** Ensure the pinned organization-wide group exists and return its id. */
export async function ensureTeamChat(callerUid: string) {
  const caller = await loadMember(callerUid);
  const id = groupId(caller.enterpriseId);
  const enterprise = await db.doc(`enterprises/${caller.enterpriseId}`).get();
  const orgName = (enterprise.data()?.name as string) || "Organization";
  const ref = db.doc(`internal_chats/${id}`);
  const existing = await ref.get();
  if (!existing.exists) {
    await ref.set({
      enterprise_id: caller.enterpriseId,
      type: "group",
      name: `${orgName} Team`,
      pinned: true,
      updated_at: FieldValue.serverTimestamp(),
      created_at: FieldValue.serverTimestamp(),
    });
  } else if (existing.data()?.name !== `${orgName} Team`) {
    await ref.set({ name: `${orgName} Team`, updated_at: FieldValue.serverTimestamp() }, { merge: true });
  }
  return { chatId: id };
}

/** Create or return the deterministic direct chat between two members. */
export async function startInternalChat(callerUid: string, args: { targetUid?: string }) {
  const caller = await loadMember(callerUid);
  const targetUid = String(args.targetUid ?? "").trim();
  if (!targetUid || targetUid === callerUid) throw new HttpsError("invalid-argument", "Choose another organization member.");
  const target = await loadMember(targetUid);
  if (target.enterpriseId !== caller.enterpriseId) throw new HttpsError("permission-denied", "That user is not in your organization.");
  const id = directId(caller.enterpriseId, callerUid, targetUid);
  const ref = db.doc(`internal_chats/${id}`);
  if (!(await ref.get()).exists) {
    await ref.set({
      enterprise_id: caller.enterpriseId,
      type: "direct",
      participant_uids: [callerUid, targetUid].sort(),
      participant_names: { [callerUid]: caller.name, [targetUid]: target.name },
      participant_emails: { [callerUid]: caller.email, [targetUid]: target.email },
      updated_at: FieldValue.serverTimestamp(),
      created_at: FieldValue.serverTimestamp(),
    });
  }
  return { chatId: id };
}

/** Send one plain-text internal message after re-checking membership. */
export async function sendInternalMessage(callerUid: string, args: { chatId?: string; text?: string }) {
  const caller = await loadMember(callerUid);
  const chatId = String(args.chatId ?? "").trim();
  const text = String(args.text ?? "").trim();
  if (!chatId || !text) throw new HttpsError("invalid-argument", "Message text is required.");
  if (text.length > 5000) throw new HttpsError("invalid-argument", "Messages must be 5,000 characters or fewer.");
  const chatRef = db.doc(`internal_chats/${chatId}`);
  const chat = await chatRef.get();
  const data = chat.data();
  if (!chat.exists || data?.enterprise_id !== caller.enterpriseId) throw new HttpsError("not-found", "Chat not found.");
  if (data.type === "direct" && !((data.participant_uids as string[] | undefined) ?? []).includes(callerUid)) {
    throw new HttpsError("permission-denied", "You are not part of this chat.");
  }

  const messageRef = chatRef.collection("messages").doc();
  const batch = db.batch();
  batch.set(messageRef, {
    enterprise_id: caller.enterpriseId,
    chat_id: chatId,
    sender_uid: callerUid,
    sender_name: caller.name,
    text,
    created_at: FieldValue.serverTimestamp(),
  });
  batch.set(chatRef, {
    last_message: text.slice(0, 180),
    last_message_at: FieldValue.serverTimestamp(),
    last_sender_uid: callerUid,
    updated_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(db.doc(`internal_chat_reads/${callerUid}_${chatId}`), {
    enterprise_id: caller.enterpriseId,
    user_id: callerUid,
    chat_id: chatId,
    read_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();

  const recipients = data.type === "group"
    ? (await activeMemberUids(caller.enterpriseId)).filter((uid) => uid !== callerUid)
    : ((data.participant_uids as string[]) ?? []).filter((uid) => uid !== callerUid);
  await notifyUsers({
    enterpriseId: caller.enterpriseId,
    recipientUids: recipients,
    kind: "internal_message",
    title: data.type === "group" ? `${caller.name} · ${data.name || "Team chat"}` : caller.name,
    body: text.slice(0, 160),
    href: `/team-chat?chat=${encodeURIComponent(chatId)}`,
    entityId: chatId,
  });
  return { ok: true, chatId, messageId: messageRef.id };
}

export async function markInternalChatRead(callerUid: string, args: { chatId?: string }) {
  const caller = await loadMember(callerUid);
  const chatId = String(args.chatId ?? "").trim();
  const chat = await db.doc(`internal_chats/${chatId}`).get();
  const data = chat.data();
  if (!chat.exists || data?.enterprise_id !== caller.enterpriseId) throw new HttpsError("not-found", "Chat not found.");
  if (data.type === "direct" && !((data.participant_uids as string[] | undefined) ?? []).includes(callerUid)) {
    throw new HttpsError("permission-denied", "You are not part of this chat.");
  }
  await db.doc(`internal_chat_reads/${callerUid}_${chatId}`).set({
    enterprise_id: caller.enterpriseId,
    user_id: callerUid,
    chat_id: chatId,
    read_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true, chatId };
}
