import { HttpsError } from "firebase-functions/v2/https";
import { db, FieldValue } from "./admin";

async function enterpriseFor(uid: string) {
  const snap = await db.doc(`users/${uid}`).get();
  const enterpriseId = snap.data()?.enterprise_id as string | undefined;
  if (!enterpriseId) throw new HttpsError("failed-precondition", "You are not part of an organization.");
  return enterpriseId;
}

export async function createCalendarEvent(uid: string, args: Record<string, unknown>) {
  const enterpriseId = await enterpriseFor(uid);
  const title = String(args.title ?? "").trim();
  const start = new Date(String(args.startAt ?? ""));
  if (!title || Number.isNaN(start.getTime())) throw new HttpsError("invalid-argument", "Title and start time are required.");
  const end = args.endAt ? new Date(String(args.endAt)) : new Date(start.getTime() + 30 * 60_000);
  if (Number.isNaN(end.getTime()) || end <= start) throw new HttpsError("invalid-argument", "End time must be after start time.");
  const taskId = args.taskId ? String(args.taskId) : null;
  if (taskId) {
    const task = await db.doc(`tasks/${taskId}`).get();
    if (task.data()?.enterprise_id !== enterpriseId || (task.data()?.assignee_uid !== uid && task.data()?.created_by_uid !== uid)) {
      throw new HttpsError("permission-denied", "You cannot schedule this task.");
    }
  }
  const ref = db.collection("calendar_events").doc();
  await ref.set({
    enterprise_id: enterpriseId,
    owner_uid: uid,
    title: title.slice(0, 160),
    description: String(args.description ?? "").trim().slice(0, 2000),
    start_at: start,
    end_at: end,
    timezone: String(args.timezone ?? "Africa/Kampala"),
    all_day: args.allDay === true,
    attendees: [],
    task_id: taskId,
    source_conversation_id: args.conversationId ? String(args.conversationId) : null,
    provider: "ellipse",
    provider_event_id: null,
    sync_status: "local",
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });
  if (taskId) await db.doc(`tasks/${taskId}`).update({ calendar_event_id: ref.id, calendar_provider: "ellipse", updated_at: FieldValue.serverTimestamp() });
  return { ok: true, id: ref.id };
}

export async function updateCalendarEvent(uid: string, args: Record<string, unknown>) {
  const enterpriseId = await enterpriseFor(uid);
  const id = String(args.id ?? "");
  const ref = db.doc(`calendar_events/${id}`);
  const snap = await ref.get();
  const event = snap.data();
  if (!snap.exists || event?.enterprise_id !== enterpriseId || event?.owner_uid !== uid) throw new HttpsError("not-found", "Calendar event not found.");
  const patch: Record<string, unknown> = { updated_at: FieldValue.serverTimestamp() };
  if (args.title !== undefined) patch.title = String(args.title).trim().slice(0, 160);
  if (args.description !== undefined) patch.description = String(args.description).trim().slice(0, 2000);
  if (args.startAt !== undefined) patch.start_at = new Date(String(args.startAt));
  if (args.endAt !== undefined) patch.end_at = new Date(String(args.endAt));
  await ref.update(patch);
  return { ok: true };
}
