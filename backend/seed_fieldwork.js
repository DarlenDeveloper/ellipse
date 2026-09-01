/**
 * Seed field-work data for testing the field-work routes.
 *
 * Writes to the LIVE `ellipse-desk` Firestore via the Admin SDK (bypasses
 * security rules). Every doc is tagged { seed: true, seed_tag: SEED_TAG } so
 * `node seed_fieldwork.js --cleanup` removes exactly what this created.
 *
 * Usage:
 *   node seed_fieldwork.js            # seed all scenarios below
 *   node seed_fieldwork.js --cleanup  # delete everything tagged SEED_TAG
 */
const admin = require("firebase-admin");
const { Timestamp } = require("firebase-admin/firestore");

const KEY_PATH = "/Users/user/Downloads/ellipse-desk-firebase-adminsdk-fbsvc-0a7dee2ced.json";
const key = require(KEY_PATH);
admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();

const SEED_TAG = "fieldwork-test";

const UID = "89dYdLr7Y6PzhRqSRJPFocopBEH3";
const ENTERPRISE_ID = "RcRSzrpXrF045B4PhHIJ";
const EMPLOYEE_NAME = "fredrick Wanale";

// Locations (lat, lng). Office is the enterprise geofence centre (1000m radius).
const OFFICE = { latitude: 0.3429008560516695, longitude: 32.590715706227066, accuracy: 12 };
const SITES = {
  bou: { latitude: 0.313611, longitude: 32.583056, accuracy: 15 },  // Bank of Uganda, Kampala Rd
  ura: { latitude: 0.317700, longitude: 32.612400, accuracy: 18 },  // URA Nakawa
  entebbe: { latitude: 0.051500, longitude: 32.463500, accuracy: 20 }, // Entebbe (~35km, out of office)
  garden_city: { latitude: 0.323400, longitude: 32.591800, accuracy: 14 }, // Garden City
};

const EAT_OFFSET_MS = 3 * 60 * 60_000;
function eatDateKey(date) { return new Date(date.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 10); }
// Timestamp for "HH:MM" wall-clock EAT on the day `daysAgo` before today.
function eatTime(daysAgo, hhmm) {
  const dayKey = eatDateKey(new Date(Date.now() - daysAgo * 86400_000));
  return Timestamp.fromMillis(Date.parse(`${dayKey}T${hhmm}:00.000+03:00`));
}

const tag = { seed: true, seed_tag: SEED_TAG };
const base = { enterprise_id: ENTERPRISE_ID, user_id: UID, employee_name: EMPLOYEE_NAME };

// ~metres of jitter. 1 deg lat ~ 111_320 m near the equator.
const M_PER_DEG = 111_320;
function jit(m) { return (Math.random() - 0.5) * 2 * (m / M_PER_DEG); }
function haversineM(a, b, c, d) {
  const R = 6371000, r = (x) => (x * Math.PI) / 180;
  const dLat = r(c - a), dLng = r(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Generate a realistic GPS breadcrumb for one field-work leg and write it as an
 * `attendance_tracks` doc. Mirrors the mobile tracker's real behaviour
 * (distanceFilter: 50m fixes + 2-min flush, dwell = few fixes while parked):
 *
 *   office --travel (a fix roughly every ~50m of movement)-->
 *   site   --dwell (sparse fixes, jitter < 60m so computeDwell() clusters it)-->
 *   office --travel back-->
 *
 * Travel legs get a curved, slightly-wandering path (not a ruler-straight line)
 * and a point roughly every STEP_M metres, so a 35km Entebbe run yields far more
 * points than a 3km Kampala hop — matching how a real distance-filtered stream
 * behaves.
 */
function buildTrack(batch, sessionRef, dateKey, from, to, tStartMs, tEndMs) {
  const points = [];
  const STEP_M = 50;                 // distanceFilter: 50m
  const legDist = haversineM(from.latitude, from.longitude, to.latitude, to.longitude);
  const nOut = Math.max(6, Math.round(legDist / STEP_M));  // fixes per travel leg

  const span = tEndMs - tStartMs;
  // Split time: 35% out, 30% dwell at site, 35% back (travel is the majority
  // of fixes; dwell is long in time but sparse in fixes).
  const tOutEnd = tStartMs + span * 0.35;
  const tDwellEnd = tStartMs + span * 0.65;

  const push = (lat, lng, ms, accM) =>
    points.push({
      latitude: +(lat).toFixed(6), longitude: +(lng).toFixed(6),
      accuracy: Math.round(accM), ts: Timestamp.fromMillis(Math.round(ms)),
    });

  // Perpendicular unit vector (for a gentle curve/wander along the route).
  const dLat = to.latitude - from.latitude, dLng = to.longitude - from.longitude;
  const len = Math.hypot(dLat, dLng) || 1e-9;
  const perpLat = -dLng / len, perpLng = dLat / len;

  const travel = (p0, p1, t0, t1, curveM) => {
    const n = Math.max(6, Math.round(haversineM(p0.latitude, p0.longitude, p1.latitude, p1.longitude) / STEP_M));
    for (let k = 0; k <= n; k++) {
      const f = k / n;
      // Sinusoidal bow so the path curves like a road instead of a straight line.
      const bow = Math.sin(f * Math.PI) * (curveM / M_PER_DEG);
      const lat = p0.latitude + (p1.latitude - p0.latitude) * f + perpLat * bow + jit(6);
      const lng = p0.longitude + (p1.longitude - p0.longitude) * f + perpLng * bow + jit(6);
      push(lat, lng, t0 + (t1 - t0) * f, 6 + Math.random() * 10); // 6–16m accuracy
    }
  };

  // Curve amount scales with distance (a long highway run bows more than a hop).
  const curveM = Math.min(400, Math.max(40, legDist * 0.06));

  // Outbound travel: office -> site
  travel(from, to, tStartMs, tOutEnd, curveM);
  // Dwell at site: sparse fixes (~90s apart) jittering within ~15m — well inside
  // the 60m dwell radius, so getAttendanceEmployeeDetail's computeDwell() clusters
  // it into a dwell marker.
  const dwellSpan = tDwellEnd - tOutEnd;
  const dwellPts = Math.max(3, Math.round(dwellSpan / 90_000));
  for (let k = 0; k < dwellPts; k++) {
    push(to.latitude + jit(15), to.longitude + jit(15), tOutEnd + (dwellSpan * k) / (dwellPts - 1), 8 + Math.random() * 8);
  }
  // Return travel: site -> office
  travel(to, from, tDwellEnd, tEndMs, curveM);

  batch.set(db.collection("attendance_tracks").doc(), {
    ...base, ...tag, session_id: sessionRef.id, date_key: dateKey,
    point_count: points.length, points,
    created_at: Timestamp.fromMillis(tEndMs),
  });
  return points.length;
}

// A round-trip: clock in -> [one or more field legs] -> clock out.
// leg = { site, reason, client, outcome, start, end }  (start/end are "HH:MM")
// Set opts.open=true to leave the worker currently IN field work (no clock out).
function buildTrip(batch, { daysAgo, clockIn, clockOut, legs, outOfOffice = false, open = false, updateCurrent = false }) {
  const dateKey = eatDateKey(new Date(Date.now() - daysAgo * 86400_000));
  const sessionRef = db.collection("attendance_sessions").doc();
  const tIn = eatTime(daysAgo, clockIn);
  const tOut = open ? null : eatTime(daysAgo, clockOut);

  batch.set(sessionRef, {
    ...base, ...tag, date_key: dateKey,
    started_at: tIn, ended_at: tOut, status: open ? "open" : "closed",
    clock_in_location: OFFICE, clock_out_location: open ? null : OFFICE,
    out_of_office: outOfOffice, clock_in_distance_m: outOfOffice ? 34800 : 0,
    worked_seconds: open ? 0 : Math.floor((tOut.toMillis() - tIn.toMillis()) / 1000),
    created_at: tIn, updated_at: tOut ?? tIn,
  });

  const evt = (type, occurred_at, extra) =>
    batch.set(db.collection("attendance_events").doc(), {
      ...base, ...tag, session_id: sessionRef.id, date_key: dateKey, type, occurred_at, ...extra,
    });

  evt("clock_in", tIn, {
    location: OFFICE, reason: null, client: null, outcome: null,
    out_of_office: outOfOffice, distance_m: outOfOffice ? 34800 : 0,
    field_started_at: null, duration_seconds: null,
  });

  let lastFieldStart = null;
  for (const leg of legs) {
    const tStart = eatTime(daysAgo, leg.start);
    evt("start_field_work", tStart, {
      location: OFFICE, reason: leg.reason, client: leg.client, outcome: null,
      out_of_office: null, distance_m: null, field_started_at: null, duration_seconds: null,
    });
    lastFieldStart = tStart;
    if (leg.end) {
      const tEnd = eatTime(daysAgo, leg.end);
      evt("return_from_field_work", tEnd, {
        location: SITES[leg.site], reason: leg.reason, client: leg.client, outcome: leg.outcome,
        out_of_office: null, distance_m: null,
        field_started_at: tStart,
        duration_seconds: Math.floor((tEnd.toMillis() - tStart.toMillis()) / 1000),
      });
      // Record the GPS route (attendance_tracks) for this leg.
      buildTrack(batch, sessionRef, dateKey, OFFICE, SITES[leg.site], tStart.toMillis(), tEnd.toMillis());
      lastFieldStart = null;
    }
  }

  if (!open) {
    evt("clock_out", tOut, {
      location: OFFICE, reason: null, client: null, outcome: null,
      out_of_office: null, distance_m: null, field_started_at: null, duration_seconds: null,
    });
  }

  // The most recent trip should own attendance_current (live status doc).
  if (updateCurrent) {
    const inField = open && lastFieldStart;
    batch.set(db.doc(`attendance_current/${ENTERPRISE_ID}_${UID}`), {
      ...base, ...tag, session_id: sessionRef.id,
      status: inField ? "field_work" : open ? "working" : "clocked_out",
      clocked_in_at: tIn,
      last_action: inField ? "start_field_work" : open ? "clock_in" : "clock_out",
      last_action_at: inField ? lastFieldStart : (tOut ?? tIn),
      last_location: inField ? OFFICE : OFFICE,
      out_of_office: outOfOffice,
      field_reason: inField ? legs[legs.length - 1].reason : null,
      field_client: inField ? legs[legs.length - 1].client : null,
      field_started_at: inField ? lastFieldStart : null,
    });
  }

  return sessionRef.id;
}

// --- Scenarios -------------------------------------------------------------
const SCENARIOS = [
  { // today: single BoU trip (this owns attendance_current)
    daysAgo: 0, clockIn: "08:30", clockOut: "17:00", updateCurrent: true,
    legs: [{ site: "bou", client: "Bank of Uganda", start: "10:00", end: "13:00",
      reason: "Deliver signed documents and follow up on account setup",
      outcome: "Documents delivered and stamped; account setup confirmed." }],
  },
  { // yesterday: two field legs, two clients
    daysAgo: 1, clockIn: "08:00", clockOut: "17:30",
    legs: [
      { site: "ura", client: "URA", start: "09:15", end: "11:00",
        reason: "Submit VAT returns", outcome: "Returns submitted; acknowledgement received." },
      { site: "garden_city", client: "Garden City Mall", start: "14:00", end: "16:00",
        reason: "Client site survey", outcome: "Survey complete; quote to follow." },
    ],
  },
  { // 2 days ago: out-of-office clock-in + distant site (Entebbe)
    daysAgo: 2, clockIn: "07:45", clockOut: "18:00", outOfOffice: true,
    legs: [{ site: "entebbe", client: "Entebbe Branch", start: "08:30", end: "15:30",
      reason: "Branch inspection and equipment handover",
      outcome: "Inspection done; equipment handed over and signed for." }],
  },
  { // 3 days ago: short quick trip
    daysAgo: 3, clockIn: "08:45", clockOut: "17:00",
    legs: [{ site: "bou", client: "Bank of Uganda", start: "11:30", end: "12:15",
      reason: "Collect stamped receipts", outcome: "Receipts collected." }],
  },
];

async function cleanup() {
  let total = 0;
  for (const col of ["attendance_sessions", "attendance_events", "attendance_tracks"]) {
    const snap = await db.collection(col).where("seed_tag", "==", SEED_TAG).get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    total += snap.size;
    console.log(`Deleted ${snap.size} from ${col}`);
  }
  const curRef = db.doc(`attendance_current/${ENTERPRISE_ID}_${UID}`);
  const cur = await curRef.get();
  if (cur.exists && cur.data().seed_tag === SEED_TAG) { await curRef.delete(); total += 1; console.log("Deleted attendance_current seed doc"); }
  console.log(`Cleanup complete. Removed ${total} docs tagged "${SEED_TAG}".`);
}

async function seed() {
  const batch = db.batch();
  const ids = SCENARIOS.map((s) => buildTrip(batch, s));
  await batch.commit();
  console.log(`Seeded ${SCENARIOS.length} field-work trips for ${EMPLOYEE_NAME}:`);
  SCENARIOS.forEach((s, i) => {
    const day = eatDateKey(new Date(Date.now() - s.daysAgo * 86400_000));
    const legDesc = s.legs.map((l) => `${l.client} ${l.start}-${l.end || "(open)"}`).join(", ");
    console.log(`  ${day}  ${s.clockIn}-${s.open ? "open" : s.clockOut}  ${s.outOfOffice ? "[out-of-office] " : ""}${legDesc}  (session ${ids[i]})`);
  });
  console.log(`All docs tagged seed_tag="${SEED_TAG}". Run with --cleanup to remove everything.`);
}

(async () => {
  const mode = process.argv.includes("--cleanup") ? cleanup : seed;
  await mode();
  process.exit(0);
})().catch((e) => { console.error("ERR", e); process.exit(1); });
