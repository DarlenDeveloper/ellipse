import { HttpsError } from "firebase-functions/v2/https";
import { db, FieldValue } from "./admin";

/**
 * Per-connection access to the organization's SHARED integrations.
 *
 * Owner and admins can use every shared connection. An employee can only use the
 * specific shared connection TYPES they've been granted (e.g. just "whatsapp").
 * They may also use any PERSONAL connection they added themselves. Access is
 * requested per connection and approved by the owner or an admin.
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

function requireManager(role: Role) {
  if (role !== "owner" && role !== "admin") {
    throw new HttpsError("permission-denied", "Only the owner or an admin can manage integration access.");
  }
}

/** The shared connection types a user has been granted (owner/admin implicitly get everything → "all"). */
export async function grantedTypesFor(enterpriseId: string, uid: string, role: Role): Promise<Set<string> | "all"> {
  if (role === "owner" || role === "admin") return "all";
  const g = await grantRef(enterpriseId, uid).get();
  return new Set((g.data()?.types as string[] | undefined) ?? []);
}

/**
 * The connection types a given user may use in direct agent chat:
 *  - owner/admin → all active org connections
 *  - employee → granted shared types + their own personal connections
 */
export async function allowedConnectionTypes(
  enterpriseId: string,
  uid: string | undefined,
  activeConnections: { type: string; scope?: string; owner_uid?: string }[]
): Promise<Set<string>> {
  if (!uid) return new Set(activeConnections.map((c) => c.type)); // automated run — no per-user limit

  const uSnap = await db.doc(`users/${uid}`).get();
  const role = (uSnap.data()?.role as Role) ?? "employee";
  const granted = await grantedTypesFor(enterpriseId, uid, role);

  const out = new Set<string>();
  for (const c of activeConnections) {
    const isPersonal = c.scope === "personal";
    if (isPersonal) {
      if (c.owner_uid === uid) out.add(c.type); // your own personal connection
    } else if (granted === "all" || granted.has(c.type)) {
      out.add(c.type); // shared/org connection you're allowed to use
    }
  }
  return out;
}

/** Employee requests access to specific shared connection types. */
export async function requestSharedAccess(callerUid: string, args: { types?: string[]; note?: string }) {
  const u = await loadUser(callerUid);
  if (u.role === "owner" || u.role === "admin") return { ok: true, alreadyHasAccess: true };

  const types = Array.isArray(args.types) ? args.types.filter(Boolean) : [];
  // Merge into any existing pending request so requesting a second connection doesn't drop the first.
  const existing = await requestRef(u.enterpriseId, callerUid).get();
  const prior = (existing.data()?.types as string[] | undefined) ?? [];
  const merged = Array.from(new Set([...prior, ...types]));

  await requestRef(u.enterpriseId, callerUid).set({
    enterprise_id: u.enterpriseId,
    uid: callerUid,
    email: u.email,
    name: u.name,
    types: merged,
    note: (args.note ?? "").slice(0, 300),
    status: "pending",
    requested_at: FieldValue.serverTimestamp(),
  });
  return { ok: true, requested: merged };
}

async function assertSameOrg(enterpriseId: string, targetUid: string) {
  const tSnap = await db.doc(`users/${targetUid}`).get();
  if (tSnap.data()?.enterprise_id !== enterpriseId) {
    throw new HttpsError("not-found", "That user is not in your organization.");
  }
}

/** Owner/admin approves (grants specific types) or denies a request. */
export async function respondAccessRequest(
  callerUid: string,
  args: { uid?: string; approve?: boolean; types?: string[] }
) {
  const caller = await loadUser(callerUid);
  requireManager(caller.role);
  const targetUid = args.uid;
  if (!targetUid) throw new HttpsError("invalid-argument", "Missing user uid.");
  await assertSameOrg(caller.enterpriseId, targetUid);

  const approve = args.approve !== false;
  const reqSnap = await requestRef(caller.enterpriseId, targetUid).get();
  const requestedTypes = (reqSnap.data()?.types as string[] | undefined) ?? [];
  // Grant either the explicitly-provided types or everything the user requested.
  const toGrant = Array.isArray(args.types) && args.types.length ? args.types : requestedTypes;

  if (approve && toGrant.length) {
    const existing = await grantRef(caller.enterpriseId, targetUid).get();
    const prior = (existing.data()?.types as string[] | undefined) ?? [];
    const merged = Array.from(new Set([...prior, ...toGrant]));
    await grantRef(caller.enterpriseId, targetUid).set(
      { enterprise_id: caller.enterpriseId, uid: targetUid, types: merged, granted_by: callerUid, granted_at: FieldValue.serverTimestamp() },
      { merge: true }
    );
  }
  await requestRef(caller.enterpriseId, targetUid).set(
    { status: approve ? "approved" : "denied", responded_by: callerUid, responded_at: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { ok: true, uid: targetUid, approved: approve, granted: approve ? toGrant : [] };
}

/** Owner/admin sets the EXACT set of shared connection types a member may use. */
export async function setConnectionGrants(callerUid: string, args: { uid?: string; types?: string[] }) {
  const caller = await loadUser(callerUid);
  requireManager(caller.role);
  if (!args.uid) throw new HttpsError("invalid-argument", "Missing user uid.");
  await assertSameOrg(caller.enterpriseId, args.uid);
  const types = Array.isArray(args.types) ? Array.from(new Set(args.types.filter(Boolean))) : [];
  await grantRef(caller.enterpriseId, args.uid).set(
    { enterprise_id: caller.enterpriseId, uid: args.uid, types, granted_by: callerUid, granted_at: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { ok: true, uid: args.uid, types };
}

/** Owner/admin revokes all of a member's shared-integration access. */
export async function revokeSharedAccess(callerUid: string, args: { uid?: string }) {
  const caller = await loadUser(callerUid);
  requireManager(caller.role);
  if (!args.uid) throw new HttpsError("invalid-argument", "Missing user uid.");
  await grantRef(caller.enterpriseId, args.uid).set(
    { types: [], updated_by: callerUid, updated_at: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { ok: true, uid: args.uid };
}
