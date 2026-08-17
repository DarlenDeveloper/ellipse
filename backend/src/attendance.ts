import { HttpsError } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { db, FieldValue } from "./admin";

type AttendanceAction = "clock_in" | "start_field_work" | "return_from_field_work" | "clock_out";

const DEFAULT_SCHEDULE = {
  timezone: "Africa/Kampala",
  days: {
    mon: { enabled: true, start: "08:00", end: "17:00" },
    tue: { enabled: true, start: "08:00", end: "17:00" },
    wed: { enabled: true, start: "08:00", end: "17:00" },
    thu: { enabled: true, start: "08:00", end: "17:00" },
    fri: { enabled: true, start: "08:00", end: "17:00" },
    sat: { enabled: true, start: "09:00", end: "15:00" },
    sun: { enabled: false, start: "09:00", end: "15:00" },
  },
};

async function caller(uid: string) {
  const snap = await db.doc(`users/${uid}`).get();
  const data = snap.data();
  if (!data?.enterprise_id) throw new HttpsError("failed-precondition", "Your account is not linked to an organization.");
  return { uid, enterpriseId: String(data.enterprise_id), role: String(data.role ?? "employee"), name: String(data.display_name ?? data.name ?? data.email ?? "Employee") };
}

function eatDateKey(date = new Date()) {
  return new Date(date.getTime() + 3 * 60 * 60_000).toISOString().slice(0, 10);
}

function validLocation(input: unknown) {
  const value = (input ?? {}) as Record<string, unknown>;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  const accuracy = Number(value.accuracy);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new HttpsError("invalid-argument", "A valid location is required.");
  }
  return { latitude, longitude, accuracy: Number.isFinite(accuracy) ? Math.max(0, accuracy) : null };
}

export async function getAttendanceStatus(uid: string) {
  const user = await caller(uid);
  const [current, settings, sessions, events] = await Promise.all([
    db.doc(`attendance_current/${user.enterpriseId}_${uid}`).get(),
    db.doc(`attendance_settings/${user.enterpriseId}`).get(),
    db.collection("attendance_sessions").where("user_id", "==", uid).get(),
    db.collection("attendance_events").where("user_id", "==", uid).get(),
  ]);
  const recentSessions = sessions.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => (b.started_at?.toMillis?.() ?? 0) - (a.started_at?.toMillis?.() ?? 0)).slice(0, 14);
  const recentFieldWork = events.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((d: any) => d.type === "return_from_field_work")
    .sort((a: any, b: any) => (b.occurred_at?.toMillis?.() ?? 0) - (a.occurred_at?.toMillis?.() ?? 0)).slice(0, 14);
  return {
    current: current.exists ? current.data() : null,
    settings: settings.exists ? settings.data() : DEFAULT_SCHEDULE,
    dateKey: eatDateKey(), role: user.role, recentSessions, recentFieldWork,
  };
}

export async function recordAttendanceAction(uid: string, args: Record<string, unknown>) {
  const user = await caller(uid);
  const action = String(args.action ?? "") as AttendanceAction;
  if (!["clock_in", "start_field_work", "return_from_field_work", "clock_out"].includes(action)) {
    throw new HttpsError("invalid-argument", "Unknown attendance action.");
  }
  const location = validLocation(args.location);
  const reason = String(args.reason ?? "").trim().slice(0, 500);
  const client = String(args.client ?? "").trim().slice(0, 160);
  const outcome = String(args.outcome ?? "").trim().slice(0, 1000);
  if (action === "start_field_work" && !reason) throw new HttpsError("invalid-argument", "A field-work reason is required.");
  if (action === "return_from_field_work" && !outcome) throw new HttpsError("invalid-argument", "A field-work outcome is required.");
  const currentRef = db.doc(`attendance_current/${user.enterpriseId}_${uid}`);
  const eventRef = db.collection("attendance_events").doc();
  const now = Timestamp.now();

  const result = await db.runTransaction(async (tx) => {
    const currentSnap = await tx.get(currentRef);
    const current = currentSnap.data();
    const status = String(current?.status ?? "clocked_out");
    const allowed = (action === "clock_in" && status === "clocked_out")
      || (action === "start_field_work" && status === "working")
      || (action === "return_from_field_work" && status === "field_work")
      || (action === "clock_out" && (status === "working" || status === "field_work"));
    if (!allowed) throw new HttpsError("failed-precondition", `You cannot ${action.replaceAll("_", " ")} while ${status.replaceAll("_", " ")}.`);

    const sessionRef = action === "clock_in" ? db.collection("attendance_sessions").doc() : db.doc(`attendance_sessions/${current?.session_id}`);
    if (action === "clock_in") {
      tx.set(sessionRef, { enterprise_id: user.enterpriseId, user_id: uid, employee_name: user.name, date_key: eatDateKey(), started_at: now, ended_at: null, status: "open", clock_in_location: location, created_at: now });
    } else if (action === "clock_out") {
      const startedAt = current?.clocked_in_at as Timestamp | undefined;
      tx.set(sessionRef, { ended_at: now, status: "closed", clock_out_location: location, worked_seconds: startedAt ? Math.max(0, Math.floor((now.toMillis() - startedAt.toMillis()) / 1000)) : 0, updated_at: now }, { merge: true });
    }

    const nextStatus = action === "clock_in" || action === "return_from_field_work" ? "working" : action === "start_field_work" ? "field_work" : "clocked_out";
    const sessionId = action === "clock_in" ? sessionRef.id : String(current?.session_id ?? "");
    tx.set(eventRef, {
      enterprise_id: user.enterpriseId, user_id: uid, employee_name: user.name,
      session_id: sessionId, date_key: eatDateKey(), type: action, occurred_at: now,
      location, reason: reason || current?.field_reason || null,
      client: client || current?.field_client || null, outcome: outcome || null,
      field_started_at: action === "return_from_field_work" ? current?.field_started_at ?? null : null,
      duration_seconds: action === "return_from_field_work" && current?.field_started_at?.toMillis
        ? Math.max(0, Math.floor((now.toMillis() - current.field_started_at.toMillis()) / 1000)) : null,
    });
    tx.set(currentRef, {
      enterprise_id: user.enterpriseId, user_id: uid, employee_name: user.name, session_id: sessionId,
      status: nextStatus, clocked_in_at: action === "clock_in" ? now : current?.clocked_in_at ?? null,
      last_action: action, last_action_at: now, last_location: location,
      field_reason: nextStatus === "field_work" ? reason : null, field_client: nextStatus === "field_work" ? client || null : null,
      field_started_at: action === "start_field_work" ? now : nextStatus === "field_work" ? current?.field_started_at ?? now : null,
    });
    return { status: nextStatus, sessionId };
  });
  return { ok: true, ...result };
}

export async function saveAttendanceSettings(uid: string, args: Record<string, unknown>) {
  const user = await caller(uid);
  if (user.role !== "owner") throw new HttpsError("permission-denied", "Only the organization owner can change attendance settings.");
  const days = args.days as Record<string, Record<string, unknown>> | undefined;
  if (!days) throw new HttpsError("invalid-argument", "Weekly schedule is required.");
  const normalized: Record<string, { enabled: boolean; start: string; end: string }> = {};
  for (const key of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
    const day = days[key] ?? {};
    const start = String(day.start ?? "");
    const end = String(day.end ?? "");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start >= end) {
      throw new HttpsError("invalid-argument", `Invalid hours for ${key}.`);
    }
    normalized[key] = { enabled: day.enabled !== false, start, end };
  }
  const value = { timezone: "Africa/Kampala", days: normalized, enterprise_id: user.enterpriseId, updated_by: uid, updated_at: FieldValue.serverTimestamp() };
  await db.doc(`attendance_settings/${user.enterpriseId}`).set(value);
  return { ok: true };
}

export async function getAttendanceDashboard(uid: string, args: Record<string, unknown>) {
  const user = await caller(uid);
  if (user.role !== "owner") throw new HttpsError("permission-denied", "Only the organization owner can view attendance monitoring.");
  const days = Math.min(93, Math.max(1, Number(args.days ?? 31)));
  const since = Timestamp.fromMillis(Date.now() - days * 86400_000);
  const [current, sessions, events, settings] = await Promise.all([
    db.collection("attendance_current").where("enterprise_id", "==", user.enterpriseId).get(),
    db.collection("attendance_sessions").where("enterprise_id", "==", user.enterpriseId).get(),
    db.collection("attendance_events").where("enterprise_id", "==", user.enterpriseId).get(),
    db.doc(`attendance_settings/${user.enterpriseId}`).get(),
  ]);
  const recentSessions = sessions.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d: any) => d.started_at?.toMillis?.() >= since.toMillis());
  const recentEvents = events.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d: any) => d.occurred_at?.toMillis?.() >= since.toMillis()).sort((a: any, b: any) => b.occurred_at.toMillis() - a.occurred_at.toMillis()).slice(0, 1000);
  return { current: current.docs.map((d) => ({ id: d.id, ...d.data() })), sessions: recentSessions, events: recentEvents, settings: settings.exists ? settings.data() : DEFAULT_SCHEDULE };
}
