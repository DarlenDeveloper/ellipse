import { HttpsError } from "firebase-functions/v2/https";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { db, FieldValue } from "./admin";
import { grantedTypesFor } from "./access";

type InboxPeriod = "today" | "week" | "month" | "all";
type Role = "owner" | "admin" | "employee";
const PAGE_SIZE = 12;

function periodStart(period: InboxPeriod): Date | null {
  if (period === "all") return null;
  const kampalaOffsetMs = 3 * 60 * 60 * 1000;
  const local = new Date(Date.now() + kampalaOffsetMs);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  let startDay = day;
  if (period === "week") startDay -= (local.getUTCDay() + 6) % 7;
  const utc = period === "month"
    ? Date.UTC(year, month, 1)
    : Date.UTC(year, month, startDay);
  return new Date(utc - kampalaOffsetMs);
}

/** Paginated, access-scoped conversation list for the Inbox. */
export async function listInboxConversations(callerUid: string, args: {
  period?: InboxPeriod;
  cursor?: { lastMessageAt?: number; id?: string } | null;
}) {
  const userSnap = await db.doc(`users/${callerUid}`).get();
  const user = userSnap.data();
  const enterpriseId = user?.enterprise_id as string | undefined;
  if (!enterpriseId) throw new HttpsError("failed-precondition", "You are not part of an organization.");
  const role = (user?.role as Role | undefined) ?? "employee";
  const isManager = role === "owner" || role === "admin";
  const grants = await grantedTypesFor(enterpriseId, callerUid, role);
  const allowed = grants === "all" ? new Set<string>() : grants;
  const period: InboxPeriod = ["today", "week", "month", "all"].includes(String(args.period)) ? args.period! : "today";
  const start = periodStart(period);

  let q: FirebaseFirestore.Query = db.collection("conversations")
    .where("enterprise_id", "==", enterpriseId);
  if (start) q = q.where("last_message_at", ">=", start);
  q = q.orderBy("last_message_at", "desc").orderBy(FieldPath.documentId(), "desc");
  const cursorMs = Number(args.cursor?.lastMessageAt);
  const cursorId = String(args.cursor?.id ?? "");
  if (cursorMs > 0 && cursorId) q = q.startAfter(Timestamp.fromMillis(cursorMs), cursorId);

  const visible: Array<Record<string, unknown>> = [];
  let scanQuery = q;
  let exhausted = false;
  let lastScanned: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  while (visible.length < PAGE_SIZE + 1 && !exhausted) {
    const snapshot = await scanQuery.limit(36).get();
    exhausted = snapshot.size < 36;
    for (const item of snapshot.docs) {
      lastScanned = item;
      const data = item.data();
      const canSee = isManager || (data.connection_scope === "personal"
        ? data.owner_uid === callerUid
        : allowed.has(String(data.channel ?? "")));
      if (!canSee) continue;
      const timestamp = data.last_message_at as Timestamp | undefined;
      visible.push({
        id: item.id,
        subject: data.subject ?? "",
        customer_ref: data.customer_ref ?? "",
        channel: data.channel ?? "",
        account_email: data.account_email ?? "",
        connection_scope: data.connection_scope ?? "org",
        owner_uid: data.owner_uid ?? null,
        last_message_at: timestamp?.toMillis() ?? null,
      });
      if (visible.length >= PAGE_SIZE + 1) break;
    }
    if (!exhausted && visible.length < PAGE_SIZE + 1 && lastScanned) {
      scanQuery = q.startAfter(lastScanned.get("last_message_at"), lastScanned.id);
    }
  }

  const hasNext = visible.length > PAGE_SIZE;
  const page = visible.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    period,
    conversations: page,
    hasNext,
    nextCursor: hasNext && last ? { lastMessageAt: last.last_message_at, id: last.id } : null,
  };
}

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
