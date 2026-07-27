import { HttpsError } from "firebase-functions/v2/https";
import { db, FieldValue } from "./admin";
import { callGemini } from "./gemini";

type Role = "owner" | "admin" | "employee";
type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
type TaskPriority = "low" | "medium" | "high" | "urgent";

async function caller(uid: string) {
  const snap = await db.doc(`users/${uid}`).get();
  const data = snap.data();
  if (!data?.enterprise_id) throw new HttpsError("failed-precondition", "You are not part of an organization.");
  return { enterpriseId: data.enterprise_id as string, role: (data.role as Role) ?? "employee" };
}

async function assertAssignee(enterpriseId: string, uid: string) {
  const snap = await db.doc(`users/${uid}`).get();
  if (snap.data()?.enterprise_id !== enterpriseId || snap.data()?.status === "removed") {
    throw new HttpsError("invalid-argument", "The assignee is not an active member of your organization.");
  }
}

function cleanPriority(value: unknown): TaskPriority {
  return ["low", "medium", "high", "urgent"].includes(String(value)) ? value as TaskPriority : "medium";
}

function cleanStatus(value: unknown): TaskStatus {
  return ["todo", "in_progress", "blocked", "done"].includes(String(value)) ? value as TaskStatus : "todo";
}

function parseJsonObject(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error("No JSON object returned");
  return JSON.parse(candidate) as Record<string, unknown>;
}

export async function extractConversationTasks(uid: string, args: { conversationId?: string }) {
  const user = await caller(uid);
  if (!args.conversationId) throw new HttpsError("invalid-argument", "Missing conversationId.");
  const convSnap = await db.doc(`conversations/${args.conversationId}`).get();
  const conv = convSnap.data();
  if (!convSnap.exists || conv?.enterprise_id !== user.enterpriseId) {
    throw new HttpsError("not-found", "Conversation not found.");
  }
  const msgSnap = await db.collection("messages")
    .where("enterprise_id", "==", user.enterpriseId)
    .where("conversation_id", "==", args.conversationId)
    .get();
  const messages = msgSnap.docs
    .map((doc) => doc.data())
    .sort((a, b) => (a.timestamp?.toMillis?.() ?? 0) - (b.timestamp?.toMillis?.() ?? 0))
    .slice(-15)
    .map((m) => `${m.sender_type === "us" ? "Our team" : m.from || m.from_email || "Customer"}: ${String(m.body || m.snippet || "").slice(0, 2500)}`);

  const prompt = `Extract only concrete, actionable tasks from this business conversation.
Return valid JSON only in this shape:
{"tasks":[{"title":"short action","description":"grounded context","priority":"low|medium|high|urgent","due_at":"ISO-8601 or null","due_text":"exact deadline phrase or empty","confidence":0.0,"calendar_recommended":false}]}
Rules: do not invent deadlines, owners, or actions; ignore newsletters and informational statements; use an empty tasks array when there is no task; calendar_recommended is true only for a real meeting or explicit time block.

Subject: ${conv?.subject ?? ""}
Channel: ${conv?.channel ?? ""}
${messages.join("\n")}`;
  try {
    const result = await callGemini({ prompt, temperature: 0 });
    const parsed = parseJsonObject(result.text);
    const raw = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    const tasks = raw.slice(0, 8).map((item: any) => ({
      title: String(item.title ?? "").trim().slice(0, 160),
      description: String(item.description ?? "").trim().slice(0, 1200),
      priority: cleanPriority(item.priority),
      due_at: item.due_at ? String(item.due_at) : null,
      due_text: String(item.due_text ?? "").slice(0, 120),
      confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)),
      calendar_recommended: item.calendar_recommended === true,
    })).filter((task) => task.title);
    return { tasks, conversation: { id: args.conversationId, subject: conv?.subject ?? "", channel: conv?.channel ?? "" } };
  } catch (error) {
    throw new HttpsError("internal", `Task extraction failed: ${(error as Error).message}`);
  }
}

export async function createTask(uid: string, args: Record<string, unknown>) {
  const user = await caller(uid);
  const title = String(args.title ?? "").trim();
  if (!title) throw new HttpsError("invalid-argument", "Task title is required.");
  const assigneeUid = String(args.assigneeUid ?? uid);
  await assertAssignee(user.enterpriseId, assigneeUid);
  const due = args.dueAt ? new Date(String(args.dueAt)) : null;
  if (due && Number.isNaN(due.getTime())) throw new HttpsError("invalid-argument", "Invalid due date.");
  const conversationId = args.conversationId ? String(args.conversationId) : null;
  if (conversationId) {
    const conv = await db.doc(`conversations/${conversationId}`).get();
    if (conv.data()?.enterprise_id !== user.enterpriseId) throw new HttpsError("permission-denied", "Invalid conversation source.");
  }
  const fingerprint = conversationId
    ? `${conversationId}:${title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`.slice(0, 500)
    : null;
  if (fingerprint) {
    const duplicate = await db.collection("tasks")
      .where("enterprise_id", "==", user.enterpriseId)
      .where("fingerprint", "==", fingerprint)
      .limit(1)
      .get();
    if (!duplicate.empty) throw new HttpsError("already-exists", "A similar task already exists from this conversation.");
  }
  const ref = db.collection("tasks").doc();
  await ref.set({
    enterprise_id: user.enterpriseId,
    title: title.slice(0, 160),
    description: String(args.description ?? "").trim().slice(0, 2000),
    status: cleanStatus(args.status),
    priority: cleanPriority(args.priority),
    assignee_uid: assigneeUid,
    created_by_uid: uid,
    due_at: due,
    source: conversationId ? "email" : "manual",
    source_conversation_id: conversationId,
    source_channel: args.sourceChannel ? String(args.sourceChannel) : null,
    calendar_event_id: null,
    calendar_provider: null,
    ai_generated: args.aiGenerated === true,
    ai_reasoning: args.aiReasoning ? String(args.aiReasoning).slice(0, 500) : null,
    fingerprint,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
    completed_at: null,
  });
  return { ok: true, id: ref.id };
}

export async function updateTask(uid: string, args: Record<string, unknown>) {
  const user = await caller(uid);
  const id = String(args.id ?? "");
  if (!id) throw new HttpsError("invalid-argument", "Missing task id.");
  const ref = db.doc(`tasks/${id}`);
  const snap = await ref.get();
  const task = snap.data();
  if (!snap.exists || task?.enterprise_id !== user.enterpriseId) throw new HttpsError("not-found", "Task not found.");
  const manager = user.role === "owner" || user.role === "admin";
  if (!manager && task?.assignee_uid !== uid && task?.created_by_uid !== uid) {
    throw new HttpsError("permission-denied", "You cannot update this task.");
  }
  const patch: Record<string, unknown> = { updated_at: FieldValue.serverTimestamp() };
  if (args.status !== undefined) {
    patch.status = cleanStatus(args.status);
    patch.completed_at = patch.status === "done" ? FieldValue.serverTimestamp() : null;
  }
  if (args.priority !== undefined) patch.priority = cleanPriority(args.priority);
  if (args.title !== undefined) patch.title = String(args.title).trim().slice(0, 160);
  if (args.description !== undefined) patch.description = String(args.description).trim().slice(0, 2000);
  if (args.assigneeUid !== undefined) {
    const assigneeUid = String(args.assigneeUid);
    await assertAssignee(user.enterpriseId, assigneeUid);
    patch.assignee_uid = assigneeUid;
  }
  if (args.dueAt !== undefined) {
    const due = args.dueAt ? new Date(String(args.dueAt)) : null;
    if (due && Number.isNaN(due.getTime())) throw new HttpsError("invalid-argument", "Invalid due date.");
    patch.due_at = due;
  }
  await ref.update(patch);
  return { ok: true };
}
