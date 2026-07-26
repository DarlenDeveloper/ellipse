import { HttpsError } from "firebase-functions/v2/https";
import { db, FieldValue } from "./admin";

/**
 * Team member management. Every function re-checks the caller's role server-side
 * (never trust the client). Rules:
 *  - Only owner/admin can manage members.
 *  - The owner can never be modified/removed, and only the owner can assign or
 *    change the `admin` role (admins manage employees only).
 *  - Seat limits enforced by tier (Starter 1 / Business 5 / Enterprise unlimited),
 *    counting active members + pending invites.
 */

type Role = "owner" | "admin" | "employee";

const SEAT_LIMITS: Record<string, number> = { starter: 1, business: 5, enterprise: 999 };

async function loadCaller(uid: string): Promise<{ uid: string; enterpriseId: string; role: Role }> {
  const snap = await db.doc(`users/${uid}`).get();
  const d = snap.data();
  if (!d?.enterprise_id) throw new HttpsError("failed-precondition", "You are not part of an organization.");
  return { uid, enterpriseId: d.enterprise_id as string, role: (d.role as Role) ?? "employee" };
}

function requireManager(role: Role) {
  if (role !== "owner" && role !== "admin") {
    throw new HttpsError("permission-denied", "Only the owner or an admin can manage members.");
  }
}

async function seatUsage(enterpriseId: string): Promise<{ used: number; limit: number }> {
  const entSnap = await db.doc(`enterprises/${enterpriseId}`).get();
  const tier = (entSnap.data()?.subscription_tier as string) ?? "business";
  const limit = SEAT_LIMITS[tier] ?? 5;
  const [membersSnap, invitesSnap] = await Promise.all([
    db.collection("users").where("enterprise_id", "==", enterpriseId).get(),
    db.collection("invites").where("enterprise_id", "==", enterpriseId).where("status", "==", "pending").get(),
  ]);
  const activeMembers = membersSnap.docs.filter((d) => (d.data().status ?? "active") !== "disabled").length;
  return { used: activeMembers + invitesSnap.size, limit };
}

/** Invite a teammate by email. */
export async function inviteMember(
  callerUid: string,
  args: { email?: string; role?: string; canApprove?: boolean }
) {
  const caller = await loadCaller(callerUid);
  requireManager(caller.role);

  const email = (args.email ?? "").trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) throw new HttpsError("invalid-argument", "A valid email is required.");

  const role: Role = args.role === "admin" ? "admin" : "employee";
  if (role === "admin" && caller.role !== "owner") {
    throw new HttpsError("permission-denied", "Only the owner can invite admins.");
  }

  // Already a member?
  const existing = await db
    .collection("users")
    .where("enterprise_id", "==", caller.enterpriseId)
    .where("email", "==", email)
    .limit(1)
    .get();
  if (!existing.empty) throw new HttpsError("already-exists", "That person is already a member.");

  const { used, limit } = await seatUsage(caller.enterpriseId);
  if (used >= limit) throw new HttpsError("resource-exhausted", `Seat limit reached (${limit}). Upgrade your plan to add more.`);

  await db.doc(`invites/${caller.enterpriseId}_${email}`).set({
    enterprise_id: caller.enterpriseId,
    email,
    role,
    can_approve: !!args.canApprove,
    status: "pending",
    invited_by: caller.uid,
    created_at: FieldValue.serverTimestamp(),
  });
  return { ok: true, email, role };
}

async function loadTarget(callerEnterpriseId: string, targetUid: string) {
  const snap = await db.doc(`users/${targetUid}`).get();
  const d = snap.data();
  if (!snap.exists || d?.enterprise_id !== callerEnterpriseId) {
    throw new HttpsError("not-found", "That member is not in your organization.");
  }
  return { ref: snap.ref, role: (d?.role as Role) ?? "employee" };
}

/** Change a member's role (employee <-> admin). */
export async function updateMemberRole(callerUid: string, args: { uid?: string; role?: string }) {
  const caller = await loadCaller(callerUid);
  requireManager(caller.role);
  const targetUid = args.uid;
  if (!targetUid) throw new HttpsError("invalid-argument", "Missing member uid.");
  if (targetUid === caller.uid) throw new HttpsError("failed-precondition", "You can't change your own role.");

  const target = await loadTarget(caller.enterpriseId, targetUid);
  if (target.role === "owner") throw new HttpsError("permission-denied", "The owner's role can't be changed.");

  const role: Role = args.role === "admin" ? "admin" : "employee";
  // Only the owner can create/demote admins.
  if ((role === "admin" || target.role === "admin") && caller.role !== "owner") {
    throw new HttpsError("permission-denied", "Only the owner can manage admins.");
  }

  await target.ref.set({ role, updated_at: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true, uid: targetUid, role };
}

/** Grant/revoke a member's ability to approve pending agent actions. */
export async function setCanApprove(callerUid: string, args: { uid?: string; value?: boolean }) {
  const caller = await loadCaller(callerUid);
  requireManager(caller.role);
  const targetUid = args.uid;
  if (!targetUid) throw new HttpsError("invalid-argument", "Missing member uid.");

  const target = await loadTarget(caller.enterpriseId, targetUid);
  if (target.role === "owner") throw new HttpsError("failed-precondition", "The owner can always approve.");
  if (target.role === "admin" && caller.role !== "owner") {
    throw new HttpsError("permission-denied", "Only the owner can change an admin's approval rights.");
  }

  await target.ref.set({ can_approve: !!args.value, updated_at: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true, uid: targetUid, can_approve: !!args.value };
}

/** Remove a member from the org (frees their seat). */
export async function removeMember(callerUid: string, args: { uid?: string }) {
  const caller = await loadCaller(callerUid);
  requireManager(caller.role);
  const targetUid = args.uid;
  if (!targetUid) throw new HttpsError("invalid-argument", "Missing member uid.");
  if (targetUid === caller.uid) throw new HttpsError("failed-precondition", "You can't remove yourself.");

  const target = await loadTarget(caller.enterpriseId, targetUid);
  if (target.role === "owner") throw new HttpsError("permission-denied", "The owner can't be removed.");
  if (target.role === "admin" && caller.role !== "owner") {
    throw new HttpsError("permission-denied", "Only the owner can remove an admin.");
  }

  await target.ref.set(
    { enterprise_id: null, role: null, can_approve: false, status: "removed", removed_at: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { ok: true, uid: targetUid };
}

/** Revoke a pending invite. */
export async function revokeInvite(callerUid: string, args: { email?: string }) {
  const caller = await loadCaller(callerUid);
  requireManager(caller.role);
  const email = (args.email ?? "").trim().toLowerCase();
  if (!email) throw new HttpsError("invalid-argument", "Missing email.");
  await db.doc(`invites/${caller.enterpriseId}_${email}`).delete();
  return { ok: true, email };
}
