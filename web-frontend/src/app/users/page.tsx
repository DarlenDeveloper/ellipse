"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SearchNormal1,
  Add,
  Crown,
  ShieldTick,
  Profile2User,
  TickCircle,
  CloseCircle,
  Trash,
  Lock1,
} from "iconsax-react";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type Role = "owner" | "admin" | "employee";

type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  can_approve: boolean;
  status: string;
  isSelf: boolean;
};

type Invite = { email: string; role: Role; can_approve: boolean };

const roleMeta: Record<Role, { label: string; icon: typeof Crown; cls: string }> = {
  owner: { label: "Owner", icon: Crown, cls: "bg-amber-50 text-amber-700" },
  admin: { label: "Admin", icon: ShieldTick, cls: "bg-purple-50 text-purple-700" },
  employee: { label: "Employee", icon: Profile2User, cls: "bg-gray-50 text-gray-600" },
};

const avatarColors = ["bg-black", "bg-purple-500", "bg-pink-500", "bg-emerald-500", "bg-amber-500", "bg-blue-500"];
const colorFor = (s: string) => avatarColors[(s.charCodeAt(0) || 0) % avatarColors.length];

export default function UsersPage() {
  const { user } = useAuth();
  const [enterpriseId, setEnterpriseId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<Role>("employee");
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [queryText, setQueryText] = useState("");
  const [loading, setLoading] = useState(true);

  const [showInvite, setShowInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accessRequests, setAccessRequests] = useState<{ uid: string; name: string; email: string; types: string[] }[]>([]);
  const [myHasAccess, setMyHasAccess] = useState(false);
  const [myRequestStatus, setMyRequestStatus] = useState<string | null>(null);

  const canManage = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      const d = snap.data();
      setMyRole((d?.role as Role) ?? "employee");
      setEnterpriseId((d?.enterprise_id as string) ?? null);
    });
  }, [user]);

  useEffect(() => {
    if (!enterpriseId || !user) return;
    const unsubMembers = onSnapshot(
      query(collection(db, "users"), where("enterprise_id", "==", enterpriseId)),
      (snap) => {
        setMembers(
          snap.docs
            .map((d) => {
              const x = d.data();
              return {
                id: d.id,
                name: (x.display_name as string) || (x.email as string) || "Member",
                email: (x.email as string) || "",
                role: (x.role as Role) ?? "employee",
                can_approve: !!x.can_approve,
                status: (x.status as string) || "active",
                isSelf: d.id === user.uid,
              };
            })
            .filter((m) => m.status !== "removed")
            .sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : a.name.localeCompare(b.name)))
        );
        setLoading(false);
      }
    );
    const unsubInvites = onSnapshot(
      query(collection(db, "invites"), where("enterprise_id", "==", enterpriseId), where("status", "==", "pending")),
      (snap) => setInvites(snap.docs.map((d) => ({ email: d.data().email, role: (d.data().role as Role) ?? "employee", can_approve: !!d.data().can_approve })))
    );
    // Pending shared-integration access requests (for owner/admin).
    const unsubReq = onSnapshot(
      query(collection(db, "access_requests"), where("enterprise_id", "==", enterpriseId), where("status", "==", "pending")),
      (snap) =>
        setAccessRequests(
          snap.docs.map((d) => ({
            uid: d.data().uid,
            name: d.data().name || d.data().email,
            email: d.data().email,
            types: (d.data().types as string[] | undefined) ?? [],
          }))
        )
    );
    // My own access grant + request status (for employees).
    const unsubGrant = onSnapshot(doc(db, "connection_grants", `${enterpriseId}_${user.uid}`), (snap) =>
      setMyHasAccess(snap.exists() && snap.data()?.shared_access === true)
    );
    const unsubMyReq = onSnapshot(doc(db, "access_requests", `${enterpriseId}_${user.uid}`), (snap) =>
      setMyRequestStatus(snap.exists() ? (snap.data()?.status as string) : null)
    );
    return () => {
      unsubMembers();
      unsubInvites();
      unsubReq();
      unsubGrant();
      unsubMyReq();
    };
  }, [enterpriseId, user]);

  const call = async (name: string, data: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await httpsCallable(functions, name)(data);
      return true;
    } catch (e) {
      setError((e as Error).message || "Action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changeRole = (m: Member, role: Role) => call("updateMemberRole", { uid: m.id, role });
  const toggleApprove = (m: Member) => call("setMemberCanApprove", { uid: m.id, value: !m.can_approve });
  const remove = async (m: Member) => {
    if (!confirm(`Remove ${m.name} from the organization?`)) return;
    call("removeMember", { uid: m.id });
  };
  const revoke = (email: string) => call("revokeInvite", { email });
  const respondAccess = (uid: string, approve: boolean) => call("respondAccessRequest", { uid, approve });
  const requestAccess = () => call("requestSharedAccess", {});

  const filtered = useMemo(
    () =>
      members.filter(
        (u) => u.name.toLowerCase().includes(queryText.toLowerCase()) || u.email.toLowerCase().includes(queryText.toLowerCase())
      ),
    [members, queryText]
  );

  // Who can the current viewer act on? Owner: anyone but owner. Admin: employees only (not owner/admin).
  const canActOn = (m: Member) => {
    if (m.isSelf || m.role === "owner") return false;
    if (isOwner) return true;
    return m.role === "employee"; // admins manage employees only
  };

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Members</h1>
          <p className="text-gray-400 mt-1">Manage your team and their roles.</p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 bg-black text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-gray-800"
          >
            <Add size={18} variant="Linear" color="#ffffff" />
            Invite Member
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 mb-4">{error}</p>}

      {/* Employee: request access to the company's shared integrations */}
      {myRole === "employee" && !myHasAccess && (
        <div className="mb-6 bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
              <Lock1 size={19} variant="Bold" color="#6b7280" />
            </span>
            <div>
              <p className="text-sm font-semibold">Company integrations</p>
              <p className="text-xs text-gray-400">
                {myRequestStatus === "pending"
                  ? "Your request is pending owner/admin approval."
                  : myRequestStatus === "denied"
                  ? "Your last request was declined. You can request again."
                  : "You need approval to use the organization's shared integrations."}
              </p>
            </div>
          </div>
          <button
            onClick={requestAccess}
            disabled={busy || myRequestStatus === "pending"}
            className="bg-black text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-gray-800 disabled:opacity-50 shrink-0"
          >
            {myRequestStatus === "pending" ? "Requested" : "Request access"}
          </button>
        </div>
      )}

      {/* Owner/admin: pending access requests */}
      {canManage && accessRequests.length > 0 && (
        <div className="mb-6 bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <h3 className="text-sm font-bold mb-3">Integration access requests</h3>
          <div className="space-y-2">
            {accessRequests.map((r) => (
              <div key={r.uid} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {r.email}
                    {r.types.length ? ` · wants: ${r.types.join(", ")}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => respondAccess(r.uid, true)}
                    disabled={busy}
                    className="flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-medium rounded-full px-3 py-1.5 hover:bg-green-100 disabled:opacity-50"
                  >
                    <TickCircle size={14} variant="Bold" /> Approve
                  </button>
                  <button
                    onClick={() => respondAccess(r.uid, false)}
                    disabled={busy}
                    className="flex items-center gap-1.5 bg-gray-50 text-gray-500 text-xs font-medium rounded-full px-3 py-1.5 hover:bg-gray-100 disabled:opacity-50"
                  >
                    <CloseCircle size={14} variant="Linear" /> Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="relative flex-1 max-w-md mb-6">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
          <SearchNormal1 size={18} variant="Linear" />
        </span>
        <input
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder="Search members..."
          className="w-full bg-white border border-gray-200 rounded-full pl-11 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200"
        />
      </div>

      <div className="bg-white rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden">
        <div
          className="grid gap-4 px-6 py-4 text-xs text-gray-400 font-medium border-b border-gray-100"
          style={{ gridTemplateColumns: "1.4fr 1.4fr 0.9fr 0.8fr 0.9fr" }}
        >
          <span>Name</span>
          <span>Email</span>
          <span>Role</span>
          <span>Approvals</span>
          <span className="text-right">Actions</span>
        </div>

        <div className="divide-y divide-gray-50">
          {loading ? (
            <div className="px-6 py-10 text-sm text-gray-400">Loading…</div>
          ) : (
            <>
              {filtered.map((m) => {
                const meta = roleMeta[m.role];
                const RoleIcon = meta.icon;
                const actionable = canManage && canActOn(m);
                return (
                  <div
                    key={m.id}
                    className="grid gap-4 px-6 py-4 items-center hover:bg-gray-50"
                    style={{ gridTemplateColumns: "1.4fr 1.4fr 0.9fr 0.8fr 0.9fr" }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0", colorFor(m.name))}>
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-semibold truncate">
                        {m.name}
                        {m.isSelf && <span className="text-gray-400 font-normal"> (you)</span>}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500 truncate">{m.email}</span>
                    <div>
                      {actionable && m.role !== "owner" ? (
                        <select
                          value={m.role}
                          disabled={busy || (m.role === "admin" && !isOwner)}
                          onChange={(e) => changeRole(m, e.target.value as Role)}
                          className="text-xs font-medium border border-gray-200 rounded-full px-3 py-1.5 bg-white outline-none disabled:opacity-50"
                        >
                          {isOwner && <option value="admin">Admin</option>}
                          <option value="employee">Employee</option>
                        </select>
                      ) : (
                        <span className={cn("text-xs font-medium rounded-full px-3 py-1 w-fit flex items-center gap-1.5", meta.cls)}>
                          <RoleIcon size={12} variant="Bold" />
                          {meta.label}
                        </span>
                      )}
                    </div>
                    <div>
                      <button
                        disabled={!actionable || busy}
                        onClick={() => toggleApprove(m)}
                        className={cn(
                          "text-xs font-medium rounded-full px-2.5 py-1 flex items-center gap-1.5 w-fit",
                          m.can_approve || m.role === "owner" ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-500",
                          actionable ? "hover:ring-1 hover:ring-gray-200 cursor-pointer" : "cursor-default"
                        )}
                        title={actionable ? "Toggle approval rights" : undefined}
                      >
                        {m.can_approve || m.role === "owner" ? <TickCircle size={13} variant="Bold" /> : <CloseCircle size={13} variant="Linear" />}
                        {m.role === "owner" ? "Always" : m.can_approve ? "Can approve" : "No"}
                      </button>
                    </div>
                    <div className="flex justify-end">
                      {actionable ? (
                        <button onClick={() => remove(m)} disabled={busy} className="text-gray-300 hover:text-red-600" title="Remove member">
                          <Trash size={17} variant="Linear" />
                        </button>
                      ) : (
                        <span className="text-gray-200">
                          <Lock1 size={15} variant="Linear" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Pending invites */}
              {invites.map((inv) => (
                <div
                  key={inv.email}
                  className="grid gap-4 px-6 py-4 items-center bg-yellow-50/30"
                  style={{ gridTemplateColumns: "1.4fr 1.4fr 0.9fr 0.8fr 0.9fr" }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                      <Profile2User size={16} variant="Bold" />
                    </div>
                    <span className="text-sm text-gray-500 italic">Invited</span>
                  </div>
                  <span className="text-sm text-gray-500 truncate">{inv.email}</span>
                  <span className={cn("text-xs font-medium rounded-full px-3 py-1 w-fit", roleMeta[inv.role].cls)}>{roleMeta[inv.role].label}</span>
                  <span className="text-xs font-medium rounded-full px-3 py-1 w-fit bg-yellow-50 text-yellow-700">Pending</span>
                  <div className="flex justify-end">
                    {canManage && (
                      <button onClick={() => revoke(inv.email)} disabled={busy} className="text-gray-300 hover:text-red-600" title="Revoke invite">
                        <Trash size={17} variant="Linear" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {filtered.length === 0 && invites.length === 0 && (
                <div className="px-6 py-10 text-sm text-gray-400 text-center">No members match your search.</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Role legend */}
      <div className="mt-8 bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <h3 className="text-sm font-bold mb-4">Role Permissions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-500">
          <div><span className="font-semibold text-gray-900">Owner</span> — Full access, billing, delete org, manage everyone.</div>
          <div><span className="font-semibold text-gray-900">Admin</span> — Manage employees, integrations, agents, settings.</div>
          <div><span className="font-semibold text-gray-900">Employee</span> — Inbox, agent chat, create docs; no member/settings management.</div>
        </div>
        <p className="text-xs text-gray-400 mt-4">
          <span className="font-medium text-gray-600">Approvals</span> can be granted to any member — it controls who may approve pending agent actions.
        </p>
      </div>

      {showInvite && (
        <InviteModal
          canInviteAdmin={isOwner}
          onClose={() => setShowInvite(false)}
          onInvited={() => setShowInvite(false)}
        />
      )}
    </main>
  );
}

function InviteModal({
  canInviteAdmin,
  onClose,
  onInvited,
}: {
  canInviteAdmin: boolean;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [canApprove, setCanApprove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await httpsCallable(functions, "inviteMember")({ email: email.trim(), role, canApprove });
      onInvited();
    } catch (e) {
      setError((e as Error).message || "Invite failed.");
    } finally {
      setBusy(false);
    }
  };

  const inputClass = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Invite a teammate</h3>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500">
            <CloseCircle size={22} variant="Linear" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" autoFocus className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={`${inputClass} bg-white`}>
              <option value="employee">Employee</option>
              {canInviteAdmin && <option value="admin">Admin</option>}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={canApprove} onChange={(e) => setCanApprove(e.target.checked)} className="w-4 h-4 rounded accent-black" />
            Can approve agent actions
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="text-xs text-gray-400">
            They&apos;ll join your organization automatically when they sign up with this email.
          </p>
        </div>
        <div className="flex items-center gap-2 mt-5">
          <button
            onClick={submit}
            disabled={busy || !email.trim()}
            className="bg-black text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send invite"}
          </button>
          <button onClick={onClose} className="text-sm font-medium text-gray-500 rounded-full px-5 py-2.5 hover:bg-gray-100">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
