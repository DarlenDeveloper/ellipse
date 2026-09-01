const admin = require("firebase-admin");
admin.initializeApp({ projectId: "ellipse-desk" });
const db = admin.firestore();
(async () => {
  const settings = await db.collection("attendance_settings").get();
  console.log("settings docs:", settings.size);
  for (const d of settings.docs) {
    console.log("SETTINGS", d.id, "geofence=", JSON.stringify(d.data().geofence));
  }
  const ev = await db.collection("attendance_events").where("type","==","clock_in").get();
  const recent = ev.docs.map(d => ({ id:d.id, ...d.data() }))
    .sort((a,b)=>(b.occurred_at?.toMillis?.()??0)-(a.occurred_at?.toMillis?.()??0)).slice(0,8);
  for (const e of recent) {
    console.log("CLOCKIN", e.employee_name, "| ooo=", e.out_of_office, "| dist=", e.distance_m,
      "| loc=", e.location ? `${e.location.latitude},${e.location.longitude}` : null,
      "| at=", e.occurred_at?.toDate?.().toISOString());
  }
})().then(()=>process.exit(0)).catch(e=>{console.error("ERR", e.message);process.exit(1);});
