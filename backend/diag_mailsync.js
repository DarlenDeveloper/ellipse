const { initializeApp, applicationDefault, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), projectId: "ellipse-desk" });
}
const db = getFirestore();

const ORG = "RcRSzrpXrF045B4PhHIJ";
const BAD = "v8xEphRhLSaX45bKAlYEOX8wUMR2";
const GOOD = "ERfhBhnNiqRyxDiMKxOvAUvRR712";

function summarizeUser(id, data) {
  if (!data) return { id, exists: false };
  return {
    id,
    exists: true,
    enterprise_id: data.enterprise_id,
    role: data.role,
    status: data.status,
    email: data.email,
    connection_scope: data.connection_scope,
    has_notification_prefs: !!data.notification_preferences,
  };
}

async function connectionsFor(uid) {
  // Look for personal-scoped connections owned by this uid, any type.
  const snap = await db.collection("connections").where("owner_uid", "==", uid).get();
  return snap.docs.map((d) => ({
    id: d.id,
    type: d.data().type,
    status: d.data().status,
    scope: d.data().scope,
    enterprise_id: d.data().enterprise_id,
    account_email: d.data().account_email || d.data().username || d.data().from_email || null,
    last_synced_at: d.data().last_synced_at?.toDate?.()?.toISOString?.() ?? d.data().last_synced_at ?? null,
    sync_cursor_len: (d.data().sync_recent_message_ids || []).length,
    has_error: d.data().last_error || d.data().error || null,
  }));
}

async function orgConnections() {
  const snap = await db.collection("connections").where("enterprise_id", "==", ORG).get();
  return snap.docs.map((d) => ({
    id: d.id,
    type: d.data().type,
    status: d.data().status,
    scope: d.data().scope,
    owner_uid: d.data().owner_uid ?? null,
    account_email: d.data().account_email || d.data().username || d.data().from_email || null,
    last_synced_at: d.data().last_synced_at?.toDate?.()?.toISOString?.() ?? d.data().last_synced_at ?? null,
    sync_cursor_len: (d.data().sync_recent_message_ids || []).length,
    last_error: d.data().last_error || d.data().error || null,
  }));
}

async function convCount(uid) {
  const personal = await db.collection("conversations")
    .where("enterprise_id", "==", ORG)
    .where("owner_uid", "==", uid)
    .limit(5).get();
  return { personal_conversations: personal.size, sample: personal.docs.slice(0, 3).map((d) => ({ id: d.id, subject: d.data().subject, last_message_at: d.data().last_message_at?.toDate?.()?.toISOString?.() ?? null, connection_scope: d.data().connection_scope })) };
}

(async () => {
  const [badSnap, goodSnap] = await Promise.all([
    db.doc(`users/${BAD}`).get(),
    db.doc(`users/${GOOD}`).get(),
  ]);

  console.log("=== USERS ===");
  console.log("BAD ", JSON.stringify(summarizeUser(BAD, badSnap.data()), null, 2));
  console.log("GOOD", JSON.stringify(summarizeUser(GOOD, goodSnap.data()), null, 2));

  console.log("\n=== CONNECTIONS owned by BAD user ===");
  console.log(JSON.stringify(await connectionsFor(BAD), null, 2));
  console.log("\n=== CONNECTIONS owned by GOOD user ===");
  console.log(JSON.stringify(await connectionsFor(GOOD), null, 2));

  console.log("\n=== ALL ORG CONNECTIONS ===");
  console.log(JSON.stringify(await orgConnections(), null, 2));

  console.log("\n=== CONVERSATIONS (personal) ===");
  console.log("BAD ", JSON.stringify(await convCount(BAD), null, 2));
  console.log("GOOD", JSON.stringify(await convCount(GOOD), null, 2));

  process.exit(0);
})().catch((e) => {
  console.error("DIAG ERROR:", e.message);
  process.exit(1);
});
