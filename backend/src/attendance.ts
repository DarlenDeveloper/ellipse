import { HttpsError } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { db, FieldValue } from "./admin";
import { notifyUsers, notificationRecipients } from "./notifications";

type AttendanceAction = "clock_in" | "start_field_work" | "return_from_field_work" | "clock_out";

type FieldWorkLocation = {
  id: string | null;
  place_id: string | null;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  radius_m: number;
};

// Default office geofence. A single circular zone; clock-ins outside it are
// allowed but flagged `out_of_office` so managers can see remote clock-ins.
const DEFAULT_GEOFENCE = {
  enabled: true,
  label: "Head office",
  latitude: 0.3429008560516695,
  longitude: 32.590715706227066,
  radius_m: 1000,
};

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
  geofence: DEFAULT_GEOFENCE,
};

// EAT (Africa/Kampala) is a fixed UTC+3 offset with no DST, so a constant
// offset is exact — matching the existing eatDateKey convention.
const EAT_OFFSET_MS = 3 * 60 * 60_000;

type Geofence = { enabled: boolean; label: string; latitude: number; longitude: number; radius_m: number };

function normalizeGeofence(input: unknown): Geofence {
  const value = (input ?? {}) as Record<string, unknown>;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  const radius = Number(value.radius_m);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    // Fall back to the default office rather than throwing, so a partial
    // settings save never bricks clock-in.
    return DEFAULT_GEOFENCE;
  }
  return {
    enabled: value.enabled !== false,
    label: String(value.label ?? "Office").slice(0, 80),
    latitude,
    longitude,
    radius_m: Number.isFinite(radius) && radius > 0 ? Math.min(50000, radius) : 1000,
  };
}

/** Great-circle distance in metres between two lat/lng points. */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Returns whether a location falls inside the enterprise geofence and the
 * measured distance. When the geofence is disabled, everything counts as
 * inside (never flag out-of-office).
 */
function evaluateGeofence(geofence: Geofence, latitude: number, longitude: number) {
  if (!geofence.enabled) return { inside: true, distance_m: 0 };
  const distance = haversineMeters(geofence.latitude, geofence.longitude, latitude, longitude);
  return { inside: distance <= geofence.radius_m, distance_m: Math.round(distance) };
}

/**
 * Notify the organization managers (owner + admins), excluding the acting
 * employee. Best-effort: never throws so a notification hiccup can't break the
 * underlying location ping.
 */
async function notifyManagers(enterpriseId: string, excludeUid: string, title: string, body: string) {
  try {
    const managers = (await notificationRecipients(enterpriseId, "managers")).filter((id) => id !== excludeUid);
    if (!managers.length) return;
    await notifyUsers({
      enterpriseId,
      recipientUids: managers,
      kind: "attendance",
      title,
      body,
      href: "/attendance",
    });
  } catch { /* notifications are best-effort */ }
}

/**
 * Shared per-ping location-event detection. Called by both the working-hours
 * ping (recordWorkingLocation) and the field-work ping batch
 * (recordAttendancePings) with the freshest known position.
 *
 * Detects, and notifies managers once per transition, for:
 *   • Office geofence enter/leave  (entered / left the office area)
 *   • Field-work destination arrival (once per destination in a trip)
 *   • Back-online after a location-off report (clears the off flag)
 *
 * All de-dup state lives on the employee's attendance_current doc:
 *   • geo_inside_office: boolean | null   — last known office in/out state
 *   • arrived_destinations: string[]      — destination keys already notified
 *   • location_reported_off: boolean      — off notification already sent
 *
 * Returns the field patch to merge onto attendance_current (the caller writes
 * it alongside last_location so we do a single write).
 */
async function detectLocationEvents(params: {
  enterpriseId: string;
  uid: string;
  name: string;
  latitude: number;
  longitude: number;
  status: string; // "working" | "field_work"
  current: FirebaseFirestore.DocumentData | undefined;
  settings: FirebaseFirestore.DocumentData | undefined;
}): Promise<Record<string, unknown>> {
  const { enterpriseId, uid, name, latitude, longitude, status, current, settings } = params;
  const patch: Record<string, unknown> = {};

  // --- Back online: a ping arrived, so location is on again. --------------
  if (current?.location_reported_off === true) {
    patch.location_reported_off = false;
    patch.location_off_at = null;
    let where = status === "field_work" ? "on field work" : "working";
    // If we can place them at the office, say so.
    const geofence = normalizeGeofence(settings?.geofence ?? DEFAULT_GEOFENCE);
    if (geofence.enabled && evaluateGeofence(geofence, latitude, longitude).inside) {
      where = "at the office";
    }
    await notifyManagers(enterpriseId, uid, "Attendance", `${name} is back online (${where}).`);
  }

  // --- Office geofence enter/leave ---------------------------------------
  const geofence = normalizeGeofence(settings?.geofence ?? DEFAULT_GEOFENCE);
  if (geofence.enabled) {
    const inside = evaluateGeofence(geofence, latitude, longitude).inside;
    const prev = current?.geo_inside_office;
    if (prev !== inside) {
      patch.geo_inside_office = inside;
      // Only notify on a real transition (prev was a known boolean), not on the
      // first-ever ping where we simply record the baseline.
      if (prev === true && inside === false) {
        await notifyManagers(enterpriseId, uid, "Attendance", `${name} has left the ${geofence.label} area.`);
      } else if (prev === false && inside === true) {
        await notifyManagers(enterpriseId, uid, "Attendance", `${name} has entered the ${geofence.label} area.`);
      }
    }
  }

  // --- Field-work destination arrival ------------------------------------
  if (status === "field_work" && Array.isArray(current?.field_locations)) {
    const already: string[] = Array.isArray(current?.arrived_destinations)
      ? (current!.arrived_destinations as string[]).map(String)
      : [];
    const arrived = new Set(already);
    for (let i = 0; i < current!.field_locations.length; i++) {
      const dest = current!.field_locations[i] as Record<string, unknown>;
      const dLat = Number(dest.latitude);
      const dLng = Number(dest.longitude);
      if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) continue;
      const radius = Number.isFinite(Number(dest.radius_m)) ? Math.max(50, Number(dest.radius_m)) : 150;
      const key = String(dest.id ?? dest.place_id ?? `${dest.label ?? "dest"}_${i}`);
      if (arrived.has(key)) continue;
      const distance = haversineMeters(dLat, dLng, latitude, longitude);
      if (distance <= radius) {
        arrived.add(key);
        const label = String(dest.label ?? "their destination");
        await notifyManagers(enterpriseId, uid, "Attendance", `${name} has arrived at ${label}.`);
      }
    }
    if (arrived.size !== already.length) {
      patch.arrived_destinations = Array.from(arrived);
    }
  }

  return patch;
}

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

function normalizeFieldWorkLocations(input: unknown): FieldWorkLocation[] {
  if (!Array.isArray(input)) return [];
  if (input.length > 8) {
    throw new HttpsError("invalid-argument", "A field trip can include up to 8 locations.");
  }
  return input.map((raw, index) => {
    const value = (raw ?? {}) as Record<string, unknown>;
    const latitude = Number(value.latitude);
    const longitude = Number(value.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new HttpsError("invalid-argument", `Field-work location ${index + 1} is invalid.`);
    }
    const label = String(value.label ?? "").trim().slice(0, 120);
    if (!label) throw new HttpsError("invalid-argument", "Every field-work location needs a name.");
    const radius = Number(value.radius_m);
    return {
      id: value.id ? String(value.id).slice(0, 160) : null,
      place_id: value.place_id || value.placeId ? String(value.place_id ?? value.placeId).slice(0, 256) : null,
      label,
      address: String(value.address ?? "").trim().slice(0, 300),
      latitude,
      longitude,
      radius_m: Number.isFinite(radius) ? Math.min(5000, Math.max(50, Math.round(radius))) : 150,
    };
  });
}

export async function getAttendanceStatus(uid: string) {
  const user = await caller(uid);
  const [current, settings, sessions, events, savedLocationDocs] = await Promise.all([
    db.doc(`attendance_current/${user.enterpriseId}_${uid}`).get(),
    db.doc(`attendance_settings/${user.enterpriseId}`).get(),
    db.collection("attendance_sessions").where("user_id", "==", uid).get(),
    db.collection("attendance_events").where("user_id", "==", uid).get(),
    db.collection("field_work_locations").where("user_id", "==", uid).get(),
  ]);
  const recentSessions = sessions.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => (b.started_at?.toMillis?.() ?? 0) - (a.started_at?.toMillis?.() ?? 0)).slice(0, 14);
  const recentFieldWork = events.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((d: any) => d.type === "return_from_field_work")
    .sort((a: any, b: any) => (b.occurred_at?.toMillis?.() ?? 0) - (a.occurred_at?.toMillis?.() ?? 0)).slice(0, 14);
  const savedLocations = savedLocationDocs.docs
    .filter((doc) => doc.data().enterprise_id === user.enterpriseId && doc.data().active !== false)
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => String(a.label ?? "").localeCompare(String(b.label ?? "")));
  return {
    current: current.exists ? current.data() : null,
    settings: settings.exists ? settings.data() : DEFAULT_SCHEDULE,
    dateKey: eatDateKey(), role: user.role, recentSessions, recentFieldWork,
    savedLocations,
  };
}

export async function saveFieldWorkLocation(uid: string, args: Record<string, unknown>) {
  const user = await caller(uid);
  const [location] = normalizeFieldWorkLocations([args.location ?? args]);
  const requestedId = String(args.id ?? location.id ?? "").trim();
  const ref = requestedId
    ? db.doc(`field_work_locations/${requestedId}`)
    : db.collection("field_work_locations").doc();
  if (requestedId) {
    const existing = await ref.get();
    if (!existing.exists
      || existing.data()?.enterprise_id !== user.enterpriseId
      || existing.data()?.user_id !== uid) {
      throw new HttpsError("not-found", "Saved location not found.");
    }
  }
  await ref.set({
    enterprise_id: user.enterpriseId,
    user_id: uid,
    place_id: location.place_id,
    label: location.label,
    address: location.address,
    latitude: location.latitude,
    longitude: location.longitude,
    radius_m: location.radius_m,
    active: true,
    updated_at: FieldValue.serverTimestamp(),
    ...(requestedId ? {} : { created_at: FieldValue.serverTimestamp() }),
  }, { merge: true });
  return { ok: true, location: { ...location, id: ref.id } };
}

export async function deleteFieldWorkLocation(uid: string, args: Record<string, unknown>) {
  const user = await caller(uid);
  const id = String(args.id ?? "").trim();
  if (!id) throw new HttpsError("invalid-argument", "A saved location is required.");
  const ref = db.doc(`field_work_locations/${id}`);
  const existing = await ref.get();
  if (!existing.exists
    || existing.data()?.enterprise_id !== user.enterpriseId
    || existing.data()?.user_id !== uid) {
    throw new HttpsError("not-found", "Saved location not found.");
  }
  await ref.set({ active: false, updated_at: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
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
  const fieldLocations = normalizeFieldWorkLocations(args.field_locations ?? args.fieldLocations);
  const source = String(args.source ?? "manual") === "geofence_auto" ? "geofence_auto" : "manual";
  const automatic = action === "clock_in" && source === "geofence_auto";
  if (action === "start_field_work" && !reason) throw new HttpsError("invalid-argument", "A field-work reason is required.");
  if (action === "start_field_work" && !fieldLocations.length) throw new HttpsError("invalid-argument", "Choose at least one field-work location.");
  if (action === "return_from_field_work" && !outcome) throw new HttpsError("invalid-argument", "A field-work outcome is required.");
  const currentRef = db.doc(`attendance_current/${user.enterpriseId}_${uid}`);
  const eventRef = db.collection("attendance_events").doc();
  const now = Timestamp.now();

  // Evaluate the office geofence for clock-in. Outside the zone is allowed but
  // flagged out_of_office so managers can see remote clock-ins.
  let geo: { inside: boolean; distance_m: number } = { inside: true, distance_m: 0 };
  if (action === "clock_in") {
    const settingsSnap = await db.doc(`attendance_settings/${user.enterpriseId}`).get();
    const geofence = normalizeGeofence(settingsSnap.data()?.geofence ?? DEFAULT_GEOFENCE);
    geo = evaluateGeofence(geofence, location.latitude, location.longitude);
    if (automatic && (!geofence.enabled || !geo.inside)) {
      throw new HttpsError("failed-precondition", "You have not reached the office clock-in radius yet.");
    }
  }
  const outOfOffice = action === "clock_in" ? !geo.inside : false;

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
      tx.set(sessionRef, { enterprise_id: user.enterpriseId, user_id: uid, employee_name: user.name, date_key: eatDateKey(), started_at: now, ended_at: null, status: "open", clock_in_location: location, out_of_office: outOfOffice, clock_in_distance_m: geo.distance_m, automatic_clock_in: automatic, clock_in_source: source, created_at: now });
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
      field_locations: action === "start_field_work" ? fieldLocations : current?.field_locations ?? null,
      source, auto: automatic,
      out_of_office: action === "clock_in" ? outOfOffice : null,
      distance_m: action === "clock_in" ? geo.distance_m : null,
      field_started_at: action === "return_from_field_work" ? current?.field_started_at ?? null : null,
      duration_seconds: action === "return_from_field_work" && current?.field_started_at?.toMillis
        ? Math.max(0, Math.floor((now.toMillis() - current.field_started_at.toMillis()) / 1000)) : null,
    });
    tx.set(currentRef, {
      enterprise_id: user.enterpriseId, user_id: uid, employee_name: user.name, session_id: sessionId,
      status: nextStatus, clocked_in_at: action === "clock_in" ? now : current?.clocked_in_at ?? null,
      last_action: action, last_action_at: now, last_location: location,
      out_of_office: action === "clock_in" ? outOfOffice : current?.out_of_office ?? false,
      automatic_clock_in: action === "clock_in" ? automatic : current?.automatic_clock_in ?? false,
      clock_in_source: action === "clock_in" ? source : current?.clock_in_source ?? "manual",
      field_reason: nextStatus === "field_work" ? reason : null, field_client: nextStatus === "field_work" ? client || null : null,
      field_locations: nextStatus === "field_work"
        ? (action === "start_field_work" ? fieldLocations : current?.field_locations ?? [])
        : null,
      field_started_at: action === "start_field_work" ? now : nextStatus === "field_work" ? current?.field_started_at ?? now : null,
      // Location-event de-dup state. Clock-in starts a clean slate; starting a
      // new field trip resets destination arrivals; clock-out clears the
      // location-off gate so a stale flag never blocks the next session.
      geo_inside_office: action === "clock_in" ? geo.inside : current?.geo_inside_office ?? null,
      arrived_destinations: action === "clock_in" || action === "start_field_work" ? [] : current?.arrived_destinations ?? [],
      location_reported_off: action === "clock_out" ? false : current?.location_reported_off ?? false,
      location_off_at: action === "clock_out" ? null : current?.location_off_at ?? null,
    });
    return { status: nextStatus, sessionId, outOfOffice, distanceM: geo.distance_m };
  });

  // Notify managers (owner/admins) when an employee clocks in or out.
  if (action === "clock_in" || action === "clock_out") {
    const actionLabel = action === "clock_in" ? "clocked in" : "clocked out";
    const recipients = await notificationRecipients(user.enterpriseId, "managers");
    // Don't notify the employee about their own action.
    const filtered = recipients.filter((id) => id !== uid);
    if (filtered.length) {
      await notifyUsers({
        enterpriseId: user.enterpriseId,
        recipientUids: filtered,
        kind: "attendance",
        title: "Attendance",
        body: `${user.name} has ${actionLabel}.`,
        href: "/attendance",
      });
    }
  }

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
  // Geofence is optional in the payload; when omitted, keep the existing zone
  // (or fall back to the default office) so a schedule-only save is safe.
  let geofence: Geofence;
  if (args.geofence !== undefined) {
    geofence = normalizeGeofence(args.geofence);
  } else {
    const existing = await db.doc(`attendance_settings/${user.enterpriseId}`).get();
    geofence = normalizeGeofence(existing.data()?.geofence ?? DEFAULT_GEOFENCE);
  }
  const value = { timezone: "Africa/Kampala", days: normalized, geofence, enterprise_id: user.enterpriseId, updated_by: uid, updated_at: FieldValue.serverTimestamp() };
  await db.doc(`attendance_settings/${user.enterpriseId}`).set(value);
  return { ok: true };
}

export async function getAttendanceDashboard(uid: string, args: Record<string, unknown>) {
  const user = await caller(uid);
  if (user.role !== "owner" && user.role !== "admin") throw new HttpsError("permission-denied", "Only owners and admins can view attendance monitoring.");
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

const CLOCK_IN_MESSAGES = [
  "Hey, lovely morning! Don't forget to clock in 🌅",
  "Rise and shine! Remember to clock in when you start your day ☀️",
  "Good morning! A quick tap to clock in and you're all set 🚀",
  "New day, new hustle! Don't forget to clock in 💪",
  "Morning! Hit that clock-in button when you're ready to roll 🎯",
];

const CLOCK_OUT_MESSAGES = [
  "Crazy work day! Hope you didn't forget to clock out 🌙",
  "Great job today! Don't forget to clock out before you head off 🏠",
  "Wrapping up? Remember to clock out so your hours count ⏰",
  "End of day reminder — clock out when you're done! 🎉",
  "Hard work pays off! Just don't forget to clock out 😄",
];

function randomMessage(messages: string[]) {
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Runs every hour. For each enterprise, checks the attendance schedule for
 * today. Sends clock-in reminders within 2 hours before to 2 hours after the
 * scheduled start, and clock-out reminders within 2 hours after the scheduled
 * end. This keeps costs low while covering the relevant window.
 */
export async function sendAttendanceReminders() {
  const eatOffset = 3 * 60 * 60_000;
  const local = new Date(Date.now() + eatOffset);
  const currentHour = local.getUTCHours();
  const currentMinute = local.getUTCMinutes();
  const nowMinutes = currentHour * 60 + currentMinute;
  const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const todayKey = dayNames[local.getUTCDay()];

  // Gather all enterprises
  const settingsSnap = await db.collection("attendance_settings").get();
  const enterprises: { id: string; days: Record<string, { enabled: boolean; start: string; end: string }> }[] = [];
  const coveredIds = new Set<string>();

  for (const doc of settingsSnap.docs) {
    const data = doc.data();
    const eid = String(data.enterprise_id ?? "");
    if (!eid) continue;
    coveredIds.add(eid);
    enterprises.push({ id: eid, days: data.days ?? DEFAULT_SCHEDULE.days });
  }

  const ownersSnap = await db.collection("users").where("role", "==", "owner").get();
  for (const doc of ownersSnap.docs) {
    const eid = String(doc.data().enterprise_id ?? "");
    if (eid && !coveredIds.has(eid)) {
      enterprises.push({ id: eid, days: DEFAULT_SCHEDULE.days });
    }
  }

  let sent = 0;
  for (const enterprise of enterprises) {
    const today = enterprise.days[todayKey];
    if (!today || !today.enabled) continue;

    const [startH, startM] = today.start.split(":").map(Number);
    const [endH, endM] = today.end.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Clock-in window: from 2hrs before start to 2hrs after start
    const isClockInWindow = nowMinutes >= (startMinutes - 120) && nowMinutes <= (startMinutes + 120);
    // Clock-out window: from end time to 2hrs after end
    const isClockOutWindow = nowMinutes >= endMinutes && nowMinutes <= (endMinutes + 120);

    if (!isClockInWindow && !isClockOutWindow) continue;

    const usersSnap = await db.collection("users").where("enterprise_id", "==", enterprise.id).get();
    const employees = usersSnap.docs.filter((d) => (d.data().status ?? "active") === "active");

    for (const emp of employees) {
      const currentSnap = await db.doc(`attendance_current/${enterprise.id}_${emp.id}`).get();
      const status = String(currentSnap.data()?.status ?? "clocked_out");

      if (isClockInWindow && status === "clocked_out") {
        await notifyUsers({
          enterpriseId: enterprise.id,
          recipientUids: [emp.id],
          kind: "attendance",
          title: "Clock In Reminder",
          body: randomMessage(CLOCK_IN_MESSAGES),
          href: "/attendance",
        });
        sent++;
      } else if (isClockOutWindow && (status === "working" || status === "field_work")) {
        await notifyUsers({
          enterpriseId: enterprise.id,
          recipientUids: [emp.id],
          kind: "attendance",
          title: "Clock Out Reminder",
          body: randomMessage(CLOCK_OUT_MESSAGES),
          href: "/attendance",
        });
        sent++;
      }
    }
  }
  return { sent };
}

// ---------------------------------------------------------------------------
// Field-work location tracking (route + dwell) with an end-of-work privacy cut.
// ---------------------------------------------------------------------------

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Returns today's scheduled end time (in ms since epoch, UTC) for the given
 * weekly schedule, evaluated in EAT (Africa/Kampala, fixed UTC+3). Returns null
 * when today is disabled or unset.
 */
function scheduledEndMillis(days: Record<string, { enabled: boolean; start: string; end: string }>, atMs = Date.now()) {
  const local = new Date(atMs + EAT_OFFSET_MS);
  const todayKey = DAY_NAMES[local.getUTCDay()];
  const today = days?.[todayKey];
  if (!today || !today.enabled) return null;
  const [endH, endM] = today.end.split(":").map(Number);
  if (!Number.isFinite(endH) || !Number.isFinite(endM)) return null;
  // Midnight UTC of the local day, then add the local end-of-day and undo the
  // EAT offset to get the true UTC instant of end-of-work.
  const localMidnightUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return localMidnightUtc + (endH * 60 + endM) * 60_000 - EAT_OFFSET_MS;
}

/**
 * Records a batch of field-work location points. Enforces the privacy cutoff:
 * points timestamped at/after today's scheduled end-of-work are dropped, and
 * the whole call is rejected when the employee is not currently on field work.
 */
export async function recordAttendancePings(uid: string, args: Record<string, unknown>) {
  const user = await caller(uid);
  const rawPoints = Array.isArray(args.points) ? args.points : [];
  if (!rawPoints.length) return { ok: true, stored: 0, cutoff: false };
  if (rawPoints.length > 240) throw new HttpsError("invalid-argument", "Too many points in one batch.");

  const currentSnap = await db.doc(`attendance_current/${user.enterpriseId}_${uid}`).get();
  const current = currentSnap.data();
  if (String(current?.status ?? "") !== "field_work") {
    // Not on field work — silently ignore so a late-arriving batch after
    // returning to office doesn't error the client.
    return { ok: true, stored: 0, cutoff: false, reason: "not_field_work" };
  }
  const sessionId = String(current?.session_id ?? "");
  if (!sessionId) return { ok: true, stored: 0, cutoff: false };

  const settingsSnap = await db.doc(`attendance_settings/${user.enterpriseId}`).get();
  const days = (settingsSnap.data()?.days ?? DEFAULT_SCHEDULE.days) as Record<string, { enabled: boolean; start: string; end: string }>;
  const endMs = scheduledEndMillis(days);

  const nowMs = Date.now();
  let cutoff = false;
  const points = rawPoints
    .map((p) => {
      const v = (p ?? {}) as Record<string, unknown>;
      const latitude = Number(v.latitude);
      const longitude = Number(v.longitude);
      const accuracy = Number(v.accuracy);
      const tsMs = Number(v.timestamp);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
      const ts = Number.isFinite(tsMs) && tsMs > 0 ? Math.min(tsMs, nowMs) : nowMs;
      // Privacy cutoff: drop any point at/after scheduled end-of-work.
      if (endMs !== null && ts >= endMs) { cutoff = true; return null; }
      return {
        latitude, longitude,
        accuracy: Number.isFinite(accuracy) ? Math.max(0, accuracy) : null,
        ts: Timestamp.fromMillis(ts),
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (points.length) {
    await db.collection("attendance_tracks").add({
      enterprise_id: user.enterpriseId,
      user_id: uid,
      employee_name: user.name,
      session_id: sessionId,
      date_key: eatDateKey(),
      point_count: points.length,
      points,
      created_at: Timestamp.fromMillis(nowMs),
    });

    // Use the most recent point in the batch for live position + event
    // detection (geofence enter/leave, destination arrival, back-online).
    const latest = points[points.length - 1];
    const location = { latitude: latest.latitude, longitude: latest.longitude, accuracy: latest.accuracy };
    const eventPatch = await detectLocationEvents({
      enterpriseId: user.enterpriseId,
      uid,
      name: user.name,
      latitude: latest.latitude,
      longitude: latest.longitude,
      status: "field_work",
      current,
      settings: settingsSnap.data(),
    });
    await db.doc(`attendance_current/${user.enterpriseId}_${uid}`).set({
      last_location: location,
      last_location_at: Timestamp.fromMillis(nowMs),
      location_source: "field_ping",
      ...eventPatch,
    }, { merge: true });
  }
  return { ok: true, stored: points.length, cutoff };
}

/**
 * Records a single periodic location ping for an employee who is clocked in and
 * "working" (not on field work). Used by the ~30-minute working-hours location
 * check that powers the live team map. Updates `last_location` on the
 * employee's attendance_current doc so owners/admins see an accurate, recent
 * position during working hours only.
 *
 * Privacy: rejected unless the caller is currently `working`, and silently
 * dropped once today's scheduled end-of-work has passed (the same cutoff the
 * field-work tracking uses). No history is kept — only the latest point is
 * stored — so this is deliberately less granular than field-work routes.
 */
export async function recordWorkingLocation(uid: string, args: Record<string, unknown>) {
  const user = await caller(uid);
  const loc = (args.location ?? {}) as Record<string, unknown>;
  const latitude = Number(loc.latitude);
  const longitude = Number(loc.longitude);
  const accuracy = Number(loc.accuracy);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new HttpsError("invalid-argument", "A valid location is required.");
  }

  const currentRef = db.doc(`attendance_current/${user.enterpriseId}_${uid}`);
  const currentSnap = await currentRef.get();
  const current = currentSnap.data();
  // Only accept pings while actually working. field_work uses attendancePing;
  // clocked_out must never be tracked.
  if (String(current?.status ?? "") !== "working") {
    return { ok: true, stored: 0, cutoff: false, reason: "not_working" };
  }

  // Privacy cutoff: drop pings at/after today's scheduled end-of-work.
  const settingsSnap = await db.doc(`attendance_settings/${user.enterpriseId}`).get();
  const days = (settingsSnap.data()?.days ?? DEFAULT_SCHEDULE.days) as Record<string, { enabled: boolean; start: string; end: string }>;
  const endMs = scheduledEndMillis(days);
  if (endMs !== null && Date.now() >= endMs) {
    return { ok: true, stored: 0, cutoff: true };
  }

  const now = Timestamp.now();
  const location = { latitude, longitude, accuracy: Number.isFinite(accuracy) ? Math.max(0, accuracy) : null };
  const eventPatch = await detectLocationEvents({
    enterpriseId: user.enterpriseId,
    uid,
    name: user.name,
    latitude,
    longitude,
    status: "working",
    current,
    settings: settingsSnap.data(),
  });
  await currentRef.set({
    last_location: location,
    last_location_at: now,
    location_source: "working_ping",
    ...eventPatch,
  }, { merge: true });
  return { ok: true, stored: 1, cutoff: false };
}

/**
 * Called by the mobile tracking isolate when it detects that location services
 * or permission dropped while the employee is still on the clock. Notifies the
 * managers exactly once ("<name>'s location is off"); the matching "back
 * online" notification is emitted by detectLocationEvents on the next ping.
 *
 * De-dup: guarded by the `location_reported_off` flag so repeated reports (the
 * isolate may retry) never spam managers.
 */
export async function reportLocationStatus(uid: string, args: Record<string, unknown>) {
  const user = await caller(uid);
  const status = String(args.status ?? "").trim();
  const currentRef = db.doc(`attendance_current/${user.enterpriseId}_${uid}`);
  const currentSnap = await currentRef.get();
  const current = currentSnap.data();
  const liveStatus = String(current?.status ?? "");

  // Only meaningful while on the clock. Ignore otherwise.
  if (liveStatus !== "working" && liveStatus !== "field_work") {
    return { ok: true, notified: false, reason: "not_on_duty" };
  }

  if (status === "off") {
    // Already reported off -> de-dup, do nothing.
    if (current?.location_reported_off === true) {
      return { ok: true, notified: false, reason: "already_off" };
    }
    await currentRef.set({
      location_reported_off: true,
      location_off_at: Timestamp.now(),
    }, { merge: true });
    await notifyManagers(user.enterpriseId, uid, "Attendance", `${user.name}'s location is off.`);
    return { ok: true, notified: true };
  }

  // status === "on": clear the flag if set. The descriptive "back online"
  // message is normally sent from the next ping (which knows where they are),
  // but if pings are not flowing we still clear the gate here.
  if (current?.location_reported_off === true) {
    await currentRef.set({ location_reported_off: false, location_off_at: null }, { merge: true });
  }
  return { ok: true, notified: false };
}

/**
 * Scheduled watchdog. Catches the case where the app is *killed* (so it cannot
 * self-report location-off). For every employee currently working / on field
 * work, if their last location ping is older than STALE_MS and we have not
 * already flagged them off, notify managers once and set the off flag. The
 * matching "back online" is emitted by detectLocationEvents when pings resume.
 */
export async function watchdogLocationOff() {
  const STALE_MS = 12 * 60_000; // ~2.4 missed 5-min pings before we alert
  const nowMs = Date.now();

  const activeSnap = await db.collection("attendance_current")
    .where("status", "in", ["working", "field_work"]).get();

  // Honor the end-of-work privacy cutoff: don't alert once tracking should have
  // stopped for the day.
  const settingsSnap = await db.collection("attendance_settings").get();
  const scheduleByEid = new Map<string, Record<string, { enabled: boolean; start: string; end: string }>>();
  for (const doc of settingsSnap.docs) {
    scheduleByEid.set(String(doc.data().enterprise_id ?? doc.id), (doc.data().days ?? DEFAULT_SCHEDULE.days));
  }

  let flagged = 0;
  for (const doc of activeSnap.docs) {
    const cur = doc.data();
    if (cur.location_reported_off === true) continue; // already off
    const eid = String(cur.enterprise_id ?? "");
    const uid = String(cur.user_id ?? "");
    if (!eid || !uid) continue;

    const days = scheduleByEid.get(eid) ?? DEFAULT_SCHEDULE.days;
    const endMs = scheduledEndMillis(days, nowMs);
    if (endMs !== null && nowMs >= endMs) continue; // past cutoff — tracking should be off anyway

    const lastPingMs = (cur.last_location_at as Timestamp | undefined)?.toMillis?.()
      ?? (cur.clocked_in_at as Timestamp | undefined)?.toMillis?.()
      ?? 0;
    if (lastPingMs === 0) continue; // never had a fix yet — give it time
    if (nowMs - lastPingMs < STALE_MS) continue; // pings are fresh

    await doc.ref.set({ location_reported_off: true, location_off_at: Timestamp.now() }, { merge: true });
    const name = String(cur.employee_name ?? "Employee");
    await notifyManagers(eid, uid, "Attendance", `${name}'s location is off.`);
    flagged++;
  }
  return { flagged };
}

/**
 * Scheduled sweep (hourly). Auto clock-out and auto-end field trips for anyone
 * still clocked in more than one hour after their scheduled end-of-work.
 * Writes events flagged `auto: true` so the UI can show "auto clock-out due to
 * delay". Notifies the employee and managers.
 */
export async function autoCloseAttendance() {
  const nowMs = Date.now();
  const now = Timestamp.fromMillis(nowMs);
  const GRACE_MS = 60 * 60_000; // one hour after scheduled end

  const settingsSnap = await db.collection("attendance_settings").get();
  const scheduleByEid = new Map<string, Record<string, { enabled: boolean; start: string; end: string }>>();
  for (const doc of settingsSnap.docs) {
    const eid = String(doc.data().enterprise_id ?? doc.id);
    scheduleByEid.set(eid, (doc.data().days ?? DEFAULT_SCHEDULE.days));
  }

  // Everyone currently working or on field work.
  const activeSnap = await db.collection("attendance_current")
    .where("status", "in", ["working", "field_work"]).get();

  let closed = 0;
  for (const doc of activeSnap.docs) {
    const cur = doc.data();
    const eid = String(cur.enterprise_id ?? "");
    if (!eid) continue;
    const uid = String(cur.user_id ?? "");
    const days = scheduleByEid.get(eid) ?? DEFAULT_SCHEDULE.days;
    const endMs = scheduledEndMillis(days, nowMs);
    if (endMs === null) continue; // day off / unscheduled — leave as-is
    if (nowMs < endMs + GRACE_MS) continue; // still within grace window

    const sessionId = String(cur.session_id ?? "");
    const wasFieldWork = String(cur.status ?? "") === "field_work";
    const location = cur.last_location ?? null;
    const clockedInAt = cur.clocked_in_at as Timestamp | undefined;

    const batch = db.batch();

    // If on field work, close the field trip first (auto return).
    if (wasFieldWork) {
      const returnRef = db.collection("attendance_events").doc();
      const fieldStart = cur.field_started_at as Timestamp | undefined;
      batch.set(returnRef, {
        enterprise_id: eid, user_id: uid, employee_name: cur.employee_name ?? "Employee",
        session_id: sessionId, date_key: cur.date_key ?? eatDateKey(), type: "return_from_field_work",
        occurred_at: now, location, reason: cur.field_reason ?? null, client: cur.field_client ?? null,
        outcome: "Auto-ended: not returned by end of work.", auto: true, auto_reason: "auto_end_field_delay",
        field_started_at: fieldStart ?? null,
        duration_seconds: fieldStart?.toMillis ? Math.max(0, Math.floor((nowMs - fieldStart.toMillis()) / 1000)) : null,
      });
    }

    // Auto clock-out event.
    const clockOutRef = db.collection("attendance_events").doc();
    batch.set(clockOutRef, {
      enterprise_id: eid, user_id: uid, employee_name: cur.employee_name ?? "Employee",
      session_id: sessionId, date_key: cur.date_key ?? eatDateKey(), type: "clock_out",
      occurred_at: now, location, auto: true, auto_reason: "auto_clock_out_delay",
    });

    // Close the session.
    if (sessionId) {
      batch.set(db.doc(`attendance_sessions/${sessionId}`), {
        ended_at: now, status: "closed", clock_out_location: location, auto_closed: true,
        auto_reason: "auto_clock_out_delay",
        worked_seconds: clockedInAt ? Math.max(0, Math.floor((nowMs - clockedInAt.toMillis()) / 1000)) : 0,
        updated_at: now,
      }, { merge: true });
    }

    // Reset live status.
    batch.set(doc.ref, {
      status: "clocked_out", last_action: "clock_out", last_action_at: now,
      auto_closed: true, field_reason: null, field_client: null, field_started_at: null,
    }, { merge: true });

    await batch.commit();
    closed++;

    // Notify the employee and managers.
    try {
      const managers = (await notificationRecipients(eid, "managers")).filter((id) => id !== uid);
      const name = String(cur.employee_name ?? "Employee");
      await notifyUsers({
        enterpriseId: eid, recipientUids: [uid], kind: "attendance",
        title: "Auto clock-out",
        body: "You were automatically clocked out an hour after end of work. Please clock out on time next time.",
        href: "/attendance",
      });
      if (managers.length) {
        await notifyUsers({
          enterpriseId: eid, recipientUids: managers, kind: "attendance",
          title: "Attendance",
          body: `${name} was auto clocked-out (still clocked in an hour after end of work).`,
          href: "/attendance",
        });
      }
    } catch { /* notifications are best-effort */ }
  }
  return { closed };
}

/**
 * Per-employee monitoring detail for owners/admins: sessions, events and the
 * field-work track (route polylines + dwell markers) over a window.
 */
export async function getAttendanceEmployeeDetail(uid: string, args: Record<string, unknown>) {
  const user = await caller(uid);
  if (user.role !== "owner" && user.role !== "admin") {
    throw new HttpsError("permission-denied", "Only owners and admins can view employee monitoring.");
  }
  const targetUid = String(args.employeeUid ?? "").trim();
  if (!targetUid) throw new HttpsError("invalid-argument", "employeeUid is required.");

  // Confirm the target belongs to the same enterprise (tenant isolation).
  const targetSnap = await db.doc(`users/${targetUid}`).get();
  if (!targetSnap.exists || String(targetSnap.data()?.enterprise_id ?? "") !== user.enterpriseId) {
    throw new HttpsError("permission-denied", "That employee is not in your organization.");
  }

  const days = Math.min(93, Math.max(1, Number(args.days ?? 14)));
  const sinceMs = Date.now() - days * 86400_000;
  const since = Timestamp.fromMillis(sinceMs);

  const [sessionsSnap, eventsSnap, tracksSnap, currentSnap] = await Promise.all([
    db.collection("attendance_sessions").where("enterprise_id", "==", user.enterpriseId).where("user_id", "==", targetUid).get(),
    db.collection("attendance_events").where("enterprise_id", "==", user.enterpriseId).where("user_id", "==", targetUid).get(),
    db.collection("attendance_tracks").where("enterprise_id", "==", user.enterpriseId).where("user_id", "==", targetUid).get(),
    db.doc(`attendance_current/${user.enterpriseId}_${targetUid}`).get(),
  ]);

  const sessions = sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((s: any) => (s.started_at?.toMillis?.() ?? 0) >= sinceMs)
    .sort((a: any, b: any) => (b.started_at?.toMillis?.() ?? 0) - (a.started_at?.toMillis?.() ?? 0));

  const events = eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .filter((e: any) => (e.occurred_at?.toMillis?.() ?? 0) >= sinceMs)
    .sort((a: any, b: any) => (b.occurred_at?.toMillis?.() ?? 0) - (a.occurred_at?.toMillis?.() ?? 0));

  // Group track points by session and flatten to an ordered polyline.
  const tracksBySession = new Map<string, { latitude: number; longitude: number; ts: number; accuracy: number | null }[]>();
  for (const doc of tracksSnap.docs) {
    const data = doc.data();
    if ((data.created_at?.toMillis?.() ?? 0) < sinceMs) continue;
    const sid = String(data.session_id ?? "");
    const arr = tracksBySession.get(sid) ?? [];
    for (const p of (data.points ?? []) as any[]) {
      arr.push({
        latitude: Number(p.latitude), longitude: Number(p.longitude),
        ts: p.ts?.toMillis?.() ?? 0,
        accuracy: p.accuracy ?? null,
      });
    }
    tracksBySession.set(sid, arr);
  }

  const tracks = Array.from(tracksBySession.entries()).map(([sessionId, pts]) => {
    const points = pts.sort((a, b) => a.ts - b.ts);
    return { session_id: sessionId, points, dwell: computeDwell(points) };
  });

  return {
    employee: { uid: targetUid, name: String(targetSnap.data()?.display_name ?? targetSnap.data()?.name ?? targetSnap.data()?.email ?? "Employee") },
    current: currentSnap.exists ? currentSnap.data() : null,
    sessions, events, tracks, since: since.toMillis(),
  };
}

/**
 * Cluster consecutive points that stay within ~60m for 3+ minutes into "dwell"
 * markers (time spent at a location) for the map view.
 */
function computeDwell(points: { latitude: number; longitude: number; ts: number }[]) {
  const DWELL_RADIUS_M = 60;
  const MIN_DWELL_MS = 3 * 60_000;
  const dwells: { latitude: number; longitude: number; start: number; end: number; seconds: number }[] = [];
  let anchor: { latitude: number; longitude: number; ts: number } | null = null;
  let last: { ts: number } | null = null;
  for (const p of points) {
    if (!anchor) { anchor = p; last = p; continue; }
    const d = haversineMeters(anchor.latitude, anchor.longitude, p.latitude, p.longitude);
    if (d <= DWELL_RADIUS_M) {
      last = p;
    } else {
      if (anchor && last && last.ts - anchor.ts >= MIN_DWELL_MS) {
        dwells.push({ latitude: anchor.latitude, longitude: anchor.longitude, start: anchor.ts, end: last.ts, seconds: Math.floor((last.ts - anchor.ts) / 1000) });
      }
      anchor = p; last = p;
    }
  }
  if (anchor && last && last.ts - anchor.ts >= MIN_DWELL_MS) {
    dwells.push({ latitude: anchor.latitude, longitude: anchor.longitude, start: anchor.ts, end: last.ts, seconds: Math.floor((last.ts - anchor.ts) / 1000) });
  }
  return dwells;
}
