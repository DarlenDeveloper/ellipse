"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import { SearchNormal1, TickCircle, CloseCircle, ClipboardTick, Cpu, Edit2, Eye } from "iconsax-react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { cn } from "@/lib/utils";
import { db } from "@/lib/firebase";
import { useAccess } from "@/lib/use-access";

function toType(agentId?: string, targetSystem?: string): string {
  const base = ((agentId?.startsWith("human-") ? targetSystem : agentId?.replace(/-agent$/, "")) || targetSystem || "").toLowerCase();
  return base === "gmail" ? "google-workspace" : base;
}

type PendingAction = {
  id: string;
  agent_id?: string;
  domain?: string;
  action_type?: string;
  action_summary?: string;
  target_system?: string;
  params?: Record<string, unknown>;
  status?: string;
  created_at?: { toDate: () => Date };
};

// target_system → connection logo (falls back to a generic chip icon).
const systemLogo: Record<string, string> = {
  gmail: "/logos/gmail.png",
  "google-workspace": "/logos/gmail.png",
  microsoft365: "/logos/outlook.png",
  zoho: "/logos/zoho.png",
  odoo: "/logos/odoo.png",
  whatsapp: "/logos/whatsapp.png",
  salesforce: "/logos/salesforce.png",
  mercury: "/logos/mercury.png",
};

const statusStyles: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700",
  approved: "bg-blue-50 text-blue-700",
  executed: "bg-green-50 text-green-700",
  rejected: "bg-gray-100 text-gray-500",
  error: "bg-red-50 text-red-600",
};

const FILTERS = ["All", "Pending", "Approved", "Executed", "Rejected"] as const;
type Filter = (typeof FILTERS)[number];

function agentLabel(agentId?: string): string {
  if (!agentId) return "Agent";
  return agentId
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function actionLabel(actionType?: string): string {
  if (!actionType) return "Action";
  const s = actionType.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function statusLabel(status?: string): string {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDate(ts?: { toDate: () => Date }): string {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paramLines(params?: Record<string, unknown>): { label: string; value: string }[] {
  if (!params) return [];
  const lines: { label: string; value: string }[] = [];
  const push = (k: string, v: unknown) => {
    const value = v === null || v === undefined ? "" : String(v);
    const label = k
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .replace(/\bid\b/gi, "ID");
    if (value.trim()) lines.push({ label, value });
  };
  for (const [k, v] of Object.entries(params)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [fk, fv] of Object.entries(v as Record<string, unknown>)) push(fk, fv);
    } else {
      push(k, v);
    }
  }
  return lines;
}

function summarizeParams(params?: Record<string, unknown>): string {
  const lines = paramLines(params);
  return lines.length ? lines.map((l) => `${l.label}: ${l.value}`).join(" · ") : "—";
}

export default function ApprovalsPage() {
  const { enterpriseId, isManager, allowsRecord } = useAccess();
  const accessKey = `${isManager}`;
  const [items, setItems] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [editItem, setEditItem] = useState<PendingAction | null>(null);

  useEffect(() => {
    if (!enterpriseId) return;
    const q = query(collection(db, "pending_actions"), where("enterprise_id", "==", enterpriseId));
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<PendingAction, "id">) }))
        // Employees only see approvals for connections they've been granted.
        .filter((r) => isManager || allowsRecord(toType(r.agent_id, r.target_system), r.params?.connectionOwnerUid ? "personal" : "org", r.params?.connectionOwnerUid as string | undefined))
        .sort(
          (a, b) => (b.created_at?.toDate?.().getTime() ?? 0) - (a.created_at?.toDate?.().getTime() ?? 0)
        );
      setItems(rows);
      setLoading(false);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enterpriseId, accessKey]);

  const decide = async (id: string, status: "approved" | "rejected") => {
    setBusyId(id);
    try {
      // Row stays visible — only its status changes (approved is then executed by the backend).
      await updateDoc(doc(db, "pending_actions", id), { status, decided_at: serverTimestamp() });
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return items.filter((it) => {
      // "Approved" filter includes executed (approved → executed downstream).
      const matchFilter =
        filter === "All" ||
        (filter === "Approved" && (it.status === "approved" || it.status === "executed")) ||
        it.status === filter.toLowerCase();
      const matchSearch =
        !s ||
        agentLabel(it.agent_id).toLowerCase().includes(s) ||
        actionLabel(it.action_type).toLowerCase().includes(s) ||
        summarizeParams(it.params).toLowerCase().includes(s);
      return matchFilter && matchSearch;
    });
  }, [items, search, filter]);

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const cols = "grid-cols-[1fr_1fr_2fr_0.9fr_0.8fr_180px]";

  return (
    <main className="p-8 max-w-[1200px]">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Approvals
          {pendingCount > 0 && (
            <span className="ml-3 text-sm font-semibold text-white bg-black rounded-full px-2.5 py-0.5 align-middle">
              {pendingCount} pending
            </span>
          )}
        </h1>
        <p className="text-gray-400 mt-2">
          Actions your agents want to take. Approve to execute, or reject to discard.
        </p>
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
            <SearchNormal1 size={18} variant="Linear" />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actions..."
            className="w-full bg-white border border-gray-200 rounded-full pl-11 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200"
          />
        </div>
        <div className="flex items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "text-xs font-medium border rounded-full px-3 py-1.5",
                filter === f
                  ? "bg-black text-white border-black"
                  : "border-gray-200 text-gray-600 hover:bg-gray-100"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className={`grid ${cols} gap-4 px-6 py-4 text-xs text-gray-400 font-medium border-b border-gray-100`}>
          <span>Agent</span>
          <span>Action</span>
          <span>Details</span>
          <span>Requested</span>
          <span>Status</span>
          <span className="text-right">Decision</span>
        </div>

        {loading ? (
          <p className="text-sm text-gray-400 px-6 py-8">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <ClipboardTick size={28} variant="Bold" color="#9ca3af" />
            </div>
            <p className="text-base font-semibold text-gray-700">Nothing here</p>
            <p className="text-sm text-gray-400 mt-1">No actions match this view.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((item) => {
              const logo = item.target_system ? systemLogo[item.target_system] : undefined;
              const isPending = item.status === "pending";
              return (
                <div
                  key={item.id}
                  className={`group grid ${cols} gap-4 px-6 py-4 items-center hover:bg-gray-50/70 transition-colors`}
                >
                  {/* Agent */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                      {logo ? (
                        <Image src={logo} alt="" width={18} height={18} className="w-[18px] h-[18px]" />
                      ) : (
                        <Cpu size={16} variant="Bold" color="#1a1a1a" />
                      )}
                    </div>
                    <span className="text-sm font-semibold truncate">{agentLabel(item.agent_id)}</span>
                  </div>

                  {/* Action */}
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-sm text-gray-800">{actionLabel(item.action_type)}</span>
                    {item.target_system && (
                      <span className="text-[11px] font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 w-fit">
                        {item.target_system}
                      </span>
                    )}
                  </div>

                  {/* Quick hover preview; the complete payload also lives in the review modal. */}
                  <div className="relative min-w-0">
                    <span className="block text-sm text-gray-600 truncate">
                      {summarizeParams(item.params)}
                    </span>
                    {paramLines(item.params).length > 0 && (
                      <div className="pointer-events-none absolute left-0 top-full z-30 mt-2 w-[360px] max-w-[70vw] translate-y-1 opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
                        <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-300">Quick preview</p>
                          {paramLines(item.params).map((line, index) => (
                            <div key={`${line.label}-${index}`} className="text-sm">
                              <span className="capitalize text-gray-400">{line.label}: </span>
                              <span className="whitespace-pre-wrap break-words text-gray-800">{line.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Requested */}
                  <span className="text-sm text-gray-400">{formatDate(item.created_at)}</span>

                  {/* Status */}
                  <span
                    className={cn(
                      "text-xs font-medium rounded-full px-3 py-1 w-fit",
                      statusStyles[item.status ?? ""] ?? "bg-gray-50 text-gray-500"
                    )}
                  >
                    {statusLabel(item.status)}
                  </span>

                  {/* Decision */}
                  <div className="flex items-center justify-end gap-2">
                    {isPending ? (
                      <>
                        <button
                          onClick={() => setEditItem(item)}
                          disabled={busyId === item.id}
                          className="flex items-center gap-1.5 text-xs font-semibold text-gray-800 border border-gray-200 bg-white hover:border-gray-400 hover:shadow-sm rounded-full px-3 py-1.5 disabled:opacity-50 transition-all"
                        >
                          {item.action_type === "send_email" || item.action_type === "send_reply" ? <Edit2 size={13} /> : <Eye size={13} />}
                          {item.action_type === "send_email" || item.action_type === "send_reply" ? "Review & edit" : "Review"}
                        </button>
                        <button
                          onClick={() => decide(item.id, "approved")}
                          disabled={busyId === item.id}
                          className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-full px-3 py-1.5 disabled:opacity-50"
                        >
                          <TickCircle size={14} variant="Bold" />
                          Approve
                        </button>
                        <button
                          onClick={() => decide(item.id, "rejected")}
                          disabled={busyId === item.id}
                          title="Reject"
                          className="flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full p-1.5 disabled:opacity-50"
                        >
                          <CloseCircle size={16} variant="Bold" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setEditItem(item)}
                        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-black rounded-full px-3 py-1.5 transition-colors"
                      >
                        <Eye size={13} /> Review
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {editItem && (
        <EmailApprovalEditor
          item={editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => setEditItem(null)}
        />
      )}
    </main>
  );
}

function EmailApprovalEditor({ item, onClose, onSaved }: { item: PendingAction; onClose: () => void; onSaved: () => void }) {
  const params = item.params ?? {};
  const isReply = item.action_type === "send_reply";
  const isEditable = item.status === "pending" && (isReply || item.action_type === "send_email");
  const [to, setTo] = useState(String(params.to ?? ""));
  const [cc, setCc] = useState(String(params.cc ?? ""));
  const [subject, setSubject] = useState(String(params.subject ?? ""));
  const [body, setBody] = useState(String(params.body ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!to.trim() || !body.trim()) return;
    setSaving(true); setError(null);
    try {
      await updateDoc(doc(db, "pending_actions", item.id), {
        params: { ...params, to: to.trim(), cc: cc.trim() || null, subject: subject.trim(), body: body.trim() },
        action_summary: `${isReply ? "Reply" : "Email"} “${subject.trim() || "(no subject)"}” to ${to.trim()} — edited before approval.`,
        updated_at: serverTimestamp(),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message || "The email could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-3xl overflow-hidden rounded-[28px] bg-white shadow-[0_30px_100px_rgba(15,23,42,0.35)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="bg-black px-7 py-6 text-white">
          <div className="flex items-start justify-between gap-5">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">Agent approval</span>
                <span className="rounded-full bg-amber-400/15 px-3 py-1 text-[11px] font-semibold text-amber-200">{statusLabel(item.status)}</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight">{isEditable ? "Review and refine the response" : "Review agent action"}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/55">{isEditable ? "Make any final changes before approval. Saving the draft will never send it automatically." : "Inspect the complete action and data the agent used before making a decision."}</p>
            </div>
            <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-white/60 transition-colors hover:bg-white/20 hover:text-white" aria-label="Close review"><CloseCircle size={22} variant="Linear" /></button>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-7 py-6">
          <div className="mb-6 grid grid-cols-3 gap-3">
            <ReviewMeta label="Agent" value={agentLabel(item.agent_id)} />
            <ReviewMeta label="Action" value={actionLabel(item.action_type)} />
            <ReviewMeta label="Channel" value={item.target_system || "Internal"} />
          </div>
          {item.action_summary && <div className="mb-6 rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3"><p className="text-[11px] font-bold uppercase tracking-wider text-violet-400">Agent reasoning</p><p className="mt-1.5 text-sm leading-6 text-slate-700">{item.action_summary}</p></div>}
          {error && <p className="mb-5 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
          {isEditable ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FieldLabel label="To"><input value={to} readOnly={isReply} onChange={(e) => setTo(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100 read-only:bg-slate-50 read-only:text-slate-500" /></FieldLabel>
                <FieldLabel label="CC (optional)"><input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="No CC recipients" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100" /></FieldLabel>
              </div>
              <FieldLabel label="Subject"><input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100" /></FieldLabel>
              <FieldLabel label="Message"><textarea autoFocus value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm leading-6 text-slate-800 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100" /></FieldLabel>
              {!!params.attachment && <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">Attachment retained: <span className="font-semibold text-slate-700">{String((params.attachment as Record<string, unknown>).fileName ?? "attached file")}</span></p>}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              {paramLines(params).map((line, index) => <div key={`${line.label}-${index}`} className="grid grid-cols-[160px_1fr] border-b border-slate-100 px-4 py-3 last:border-0"><span className="text-xs font-semibold capitalize text-slate-400">{line.label}</span><span className="whitespace-pre-wrap break-words text-sm text-slate-700">{line.value}</span></div>)}
              {paramLines(params).length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">No additional action data.</p>}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-7 py-4"><p className="text-xs text-slate-400">Requested {formatDate(item.created_at)}</p><div className="flex gap-3"><button onClick={onClose} className="rounded-full px-5 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-200/60">Close</button>{isEditable && <button onClick={save} disabled={!to.trim() || !body.trim() || saving} className="rounded-full bg-slate-950 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40">{saving ? "Saving changes…" : "Save edited draft"}</button>}</div></div>
      </div>
    </div>
  );
}

function ReviewMeta({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 truncate text-sm font-semibold capitalize text-slate-800">{value}</p></div>;
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-500">{label}{children}</label>;
}
