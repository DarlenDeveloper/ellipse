const admin = require("firebase-admin");
admin.initializeApp({ projectId: "ellipse-desk" });
const db = admin.firestore();

const GEOFENCE = { enabled: true, label: "Head office", latitude: 0.3429008560516695, longitude: 32.590715706227066, radius_m: 1000 };

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

(async () => {
  // 1) Persist geofence into every enterprise settings doc (merge).
  const settings = await db.collection("attendance_settings").get();
  for (const d of settings.docs) {
    if (d.data().geofence === undefined) {
      await d.ref.set({ geofence: GEOFENCE }, { merge: true });
      console.log("PERSISTED geofence ->", d.id);
    } else {
      console.log("already has geofence ->", d.id);
    }
  }

  // 2) Backfill clock-in events missing out_of_office, + their sessions.
  const ev = await db.collection("attendance_events").where("type","==","clock_in").get();
  let fixedEvents = 0, fixedSessions = 0;
  for (const doc of ev.docs) {
    const e = doc.data();
    if (e.out_of_office !== undefined && e.out_of_office !== null) continue;
    const loc = e.location;
    if (!loc || typeof loc.latitude !== "number") continue;
    const dist = Math.round(haversineMeters(GEOFENCE.latitude, GEOFENCE.longitude, loc.latitude, loc.longitude));
    const ooo = dist > GEOFENCE.radius_m;
    await doc.ref.set({ out_of_office: ooo, distance_m: dist, backfilled: true }, { merge: true });
    fixedEvents++;
    if (e.session_id) {
      await db.doc(`attendance_sessions/${e.session_id}`).set(
        { out_of_office: ooo, clock_in_distance_m: dist, backfilled: true }, { merge: true }
      ).catch(()=>{ fixedSessions--; });
      fixedSessions++;
    }
  }
  console.log(`BACKFILL events=${fixedEvents} sessions=${fixedSessions}`);
})().then(()=>process.exit(0)).catch(e=>{console.error("ERR", e.message);process.exit(1);});
