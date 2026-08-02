import { createHash } from "crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { db, FieldValue } from "./admin";
import { grantedTypesFor } from "./access";

type Role = "owner" | "admin" | "employee";
type Granularity = "hourly" | "daily" | "weekly" | "monthly";

const CACHE_MS = 5 * 60_000;
const TARGET_TO_TYPE: Record<string, string> = { gmail: "google-workspace" };
const typeOf = (value?: string) => TARGET_TO_TYPE[String(value ?? "").replace(/-agent$/, "").toLowerCase()] ?? String(value ?? "").replace(/-agent$/, "").toLowerCase();
const pad = (value: number) => String(value).padStart(2, "0");

function bucketKey(date: Date, granularity: Granularity) {
  const year = date.getUTCFullYear();
  if (granularity === "hourly") return `${year}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}-${pad(date.getUTCHours())}`;
  if (granularity === "daily") return `${year}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  if (granularity === "weekly") {
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
  }
  return `${year}-${pad(date.getUTCMonth() + 1)}`;
}

function asDate(value: unknown): Date | null {
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate: () => Date }).toDate();
  if (value instanceof Date) return value;
  return null;
}

function dateIso(value: unknown) {
  return asDate(value)?.toISOString() ?? null;
}

export async function getDashboardData(enterpriseId: string, uid: string) {
  const userSnap = await db.doc(`users/${uid}`).get();
  const user = userSnap.data();
  if (!user || user.enterprise_id !== enterpriseId) throw new HttpsError("permission-denied", "Wrong organization.");

  const role = (user.role as Role | undefined) ?? "employee";
  const isManager = role === "owner" || role === "admin";
  const granted = await grantedTypesFor(enterpriseId, uid, role);
  const grantedTypes = granted === "all" ? [] : [...granted].sort();
  const scopeSignature = isManager ? "org" : createHash("sha1").update(grantedTypes.join(",")).digest("hex").slice(0, 12);
  const cacheId = isManager ? `${enterpriseId}_org` : `${enterpriseId}_${uid}_${scopeSignature}`;
  const cacheRef = db.doc(`dashboard_cache/${cacheId}`);
  const cached = await cacheRef.get();
  const cachedData = cached.data();
  const generatedAt = asDate(cachedData?.generated_at)?.getTime() ?? 0;
  if (cachedData?.payload && Date.now() - generatedAt < CACHE_MS) {
    return { ...(cachedData.payload as Record<string, unknown>), cached: true };
  }

  const [eventSnap, actionSnap, conversationSnap, connectionSnap] = await Promise.all([
    db.collection("analytics_events").where("workspace_id", "==", enterpriseId).get(),
    db.collection("pending_actions").where("enterprise_id", "==", enterpriseId).get(),
    db.collection("conversations").where("enterprise_id", "==", enterpriseId).get(),
    db.collection("connections").where("enterprise_id", "==", enterpriseId).get(),
  ]);

  const allowed = new Set(grantedTypes);
  const canSee = (connectionType: string, scope?: string | null, ownerUid?: string | null) =>
    isManager || (scope === "personal" ? ownerUid === uid : allowed.has(typeOf(connectionType)));

  const events = eventSnap.docs.map((item) => item.data()).filter((event) => {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const channel = String(payload.channel ?? event.channel ?? (event.source === "zoho_record" ? "zoho" : ""));
    return isManager || (!channel ? false : canSee(channel, String(payload.connection_scope ?? event.connection_scope ?? "org"), String(payload.owner_uid ?? event.owner_uid ?? "")));
  });
  const actions = actionSnap.docs.map((item): Record<string, any> => ({ id: item.id, ...(item.data() as Record<string, any>) })).filter((action) => {
    const params = (action.params ?? {}) as Record<string, unknown>;
    const ownerUid = String(params.connectionOwnerUid ?? action.owner_uid ?? "");
    return canSee(typeOf(String(action.agent_id ?? action.target_system ?? "")), ownerUid ? "personal" : "org", ownerUid);
  });
  const conversations = conversationSnap.docs.map((item): Record<string, any> => ({ id: item.id, ...(item.data() as Record<string, any>) })).filter((conversation) =>
    canSee(String(conversation.channel ?? ""), String(conversation.connection_scope ?? "org"), String(conversation.owner_uid ?? ""))
  );
  const connections = connectionSnap.docs.map((item) => item.data()).filter((connection) =>
    connection.status === "active" && canSee(String(connection.type ?? ""), String(connection.scope ?? "org"), String(connection.owner_uid ?? ""))
  );

  const charts: Record<Granularity, Record<string, { messages: number; agentActions: number }>> = {
    hourly: {}, daily: {}, weekly: {}, monthly: {},
  };
  const addBucket = (date: Date, metric: "messages" | "agentActions") => {
    for (const granularity of Object.keys(charts) as Granularity[]) {
      const key = bucketKey(date, granularity);
      const bucket = (charts[granularity][key] ??= { messages: 0, agentActions: 0 });
      bucket[metric]++;
    }
  };
  for (const event of events) {
    if (event.source !== "message") continue;
    const date = asDate(event.timestamp);
    if (date) addBucket(date, "messages");
  }
  for (const action of actions) {
    const date = asDate(action.created_at);
    if (date) addBucket(date, "agentActions");
  }

  const pending = actions
    .filter((action) => action.status === "pending")
    .sort((a, b) => (asDate(b.created_at)?.getTime() ?? 0) - (asDate(a.created_at)?.getTime() ?? 0));
  const recentThreads = conversations
    .sort((a, b) => (asDate(b.last_message_at)?.getTime() ?? 0) - (asDate(a.last_message_at)?.getTime() ?? 0))
    .slice(0, 6)
    .map((conversation) => ({
      id: conversation.id,
      subject: conversation.subject ?? "",
      customer_ref: conversation.customer_ref ?? "",
      channel: conversation.channel ?? "",
      status: conversation.status ?? "",
      last_message_at: dateIso(conversation.last_message_at),
    }));

  const payload = {
    counts: {
      messages: events.filter((event) => event.source === "message").length,
      channels: connections.length,
      threads: conversations.filter((conversation) => conversation.status === "open").length,
      pending: pending.length,
      agents: connections.length,
      records: events.filter((event) => event.source === "zoho_record").length,
    },
    charts,
    pendingApprovals: pending.slice(0, 4).map((action) => ({
      id: action.id,
      agent_id: action.agent_id ?? "",
      target_system: action.target_system ?? "",
      action_type: action.action_type ?? "",
      status: action.status ?? "",
      created_at: dateIso(action.created_at),
    })),
    recentThreads,
    generatedAt: new Date().toISOString(),
  };

  await cacheRef.set({
    enterprise_id: enterpriseId,
    user_id: isManager ? null : uid,
    scope: isManager ? "organization" : "employee",
    generated_at: FieldValue.serverTimestamp(),
    payload,
  });
  return { ...payload, cached: false };
}
