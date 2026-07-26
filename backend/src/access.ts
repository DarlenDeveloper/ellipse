import { HttpsError } from "firebase-functions/v2/https";
import { db, FieldValue } from "./admin";

/**
 * Per-user access to the organization's SHARED integrations (the owner's/admin's
 * connections). Owner and admins can use every shared connection. An employee
 * must REQUEST access; the owner or an admin approves it, which writes a grant.
 *
 * Personal integrations a user adds themselves are always usable by that user
 * (no approval) — their activity is logged into the owner's daily summary.
 */

type Role = "owner" | "admin" | "employee";

function grantRef(enterpriseId: string, uid: string) {
  return db.doc(`connection_grants/${enterpriseId}_${uid}`);
}
function requestRef(enterpriseId: string, uid: string) {
  return db.doc(`access_requests/${enterpriseId}_${uid}`);
}

async function loadUser(uid: string): Promise<{ enterpriseId: string; role: Role; email: string; name: string }> {
  const snap = await db.doc(`users/${uid}`).get();
  const d = snap.data();
  if (!d?.enterprise_id) throw new HttpsError("failed-precondition", "You are not part of an organization.");
  return {
    enterpriseId: d.enterprise_id as string,
    role: (d.role as Role) ?? "employee",
    email: (d.email as string) ?? "",
    name: (d.display_name as string) ?? (d.email as string) ?? "Member",
  };
}

/** Does this user currently have access to the org's shared integrations? */
export async function hasSharedAccess(enterpriseId: string, uid: string, role: Role): Promise<boolean> {
  if (role === "owner" || role === "admin") return true;
  const g = await grantRef(enterpriseId, uid).get();
  return g.exists && g.data()?.shared_access === true;
}

/**
 * The connection types a given user may use in direct agent chat:
 *  - owner/admin OR granted employee → all active org connections
 *  - ungranted employee → only their own personal connections
 */
export async function allowedConnectionTypes(
  enterpriseId: string,
  uid: string | undefined,
  activeConnections: { type: string; scope?: string; owner_uid?: string }[]
): Promise<Set<string>> {
  // No caller (e.g. automated agent run) → no per-user restriction.
  if (!uid) return new Set(activeConnections.map((c) => c.type));

  const uSnap = await db.doc(`users/${uid}`).get();
  const role = (uSnap.data()?.role as Role) ?? "employee";
  const shared = await hasSharedAccess(enterpriseId, uid, role);

  const out = new Set<string>();
  for (const c of activeConnections) {
    const isPersonal = c.scope === "personal";
    if (isPersonal) {
      if (c.owner_uid === uid) out.add(c.type); // your own personal connection
    } else if (shared) {
      out.add(c.type); // shared/org connection, and you're allowed
    }
  }
  return out;
}

/** Employee asks for access to the company's shared integrations. */
export async function requestSharedAccess(callerUid: string, args: { note?: string }) {
  const u = await loadUser(callerUid);
  if (u.role === "owner" || u.role === "admin") {
    return { ok: true, alreadyHasAccess: true };
  }
  const existing = await grantRef(u.enterpriseId, callerUid).get();
  if (existing.exists && existing.data()?.shared_access === true) {
    return { ok: true, alreadyHasAccess: true };
  }
  await requestRef(u.enterpriseId, callerUid).set({
    enterprise_id: u.enterpriseId,
    uid: callerUid,
    email: u.email,
    name: u.name,
    note: (args.note ?? "").slice(0, 300),
    status: "pending",
    requested_at: FieldValue.serverTimestamp(),
  });
  return { ok: true, requested: true };
}

/** Owner/admin approves or denies a shared-access request. */
export async function respondAccessRequest(callerUid: string, args: { uid?: string; approve?: boolean }) {
  const caller = await loadUser(callerUid);
  if (caller.role !== "owner" && caller.role !== "admin") {
    throw new HttpsError("permission-denied", "Only the owner or an admin can approve integration access.");
  }
  const targetUid = args.uid;
  if (!targetUid) throw new HttpsError("invalid-argument", "Missing user uid.");

  // Ensure the target is in the caller's org.
  const tSnap = await db.doc(`users/${targetUid}`).get();
  if (tSnap.data()?.enterprise_id !== caller.enterpriseId) {
    throw new HttpsError("not-found", "That user is not in your organization.");
  }

  const approve = args.approve !== false;
  if (approve) {
    await grantRef(caller.enterpriseId, targetUid).set({
      enterprise_id: caller.enterpriseId,
      uid: targetUid,
      shared_access: true,
      granted_by: callerUid,
      granted_at: FieldValue.serverTimestamp(),
    });
  } else {
    await grantRef(caller.enterpriseId, targetUid).set(
      { shared_access: false, updated_by: callerUid, updated_at: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }
  await requestRef(caller.enterpriseId, targetUid).set(
    { status: approve ? "approved" : "denied", responded_by: callerUid, responded_at: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { ok: true, uid: targetUid, approved: approve };
}

/** Owner/admin revokes a member's shared-integration access. */
export async function revokeSharedAccess(callerUid: string, args: { uid?: string }) {
  const caller = await loadUser(callerUid);
  if (caller.role !== "owner" && caller.role !== "admin") {
    throw new HttpsError("permission-denied", "Only the owner or an admin can change integration access.");
  }
  if (!args.uid) throw new HttpsError("invalid-argument", "Missing user uid.");
  await grantRef(caller.enterpriseId, args.uid).set(
    { shared_access: false, updated_by: callerUid, updated_at: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { ok: true, uid: args.uid };
}
