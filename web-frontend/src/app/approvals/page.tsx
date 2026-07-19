"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { SearchNormal1, TickCircle, CloseCircle, ClipboardTick, Cpu } from "iconsax-react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { cn } from "@/lib/utils";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

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
  zoho: "/logos/zoho.svg",
  odoo: "/logos/odoo.svg",
  whatsapp: "/logos/whatsapp.svg",
  salesforce: "/logos/salesforce.svg",
  microsoft365: "/logos/microsoft365.svg",
  "google-workspace": "/logos/gmail.svg",
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

function summarizeParams(params?: Record<string, unknown>): string {
  if (!params) return "—";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v && typeof v === "object") {
      for (const [fk, fv] of Object.entries(v as Record<string, unknown>)) {
        parts.push(`${fk}: ${fv}`);
      }
    } else {
      parts.push(`${k}: ${v}`);
    }
  }
  return parts.join(" · ") || "—";
}

export default function ApprovalsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("All");

  useEffect(() => {
    if (!user) return;
    let unsub: (() => void) | undefined;

    (async () => {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const enterpriseId = userSnap.data()?.enterprise_id as string | undefined;
      if (!enterpriseId) {
        setLoading(false);
        return;
      }
      const q = query(collection(db, "pending_actions"), where("enterprise_id", "==", enterpriseId));
      unsub = onSnapshot(q, (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<PendingAction, "id">) }))
          .sort(
            (a, b) =>
              (b.created_at?.toDate?.().getTime() ?? 0) - (a.created_at?.toDate?.().getTime() ?? 0)
          );
        setItems(rows);
        setLoading(false);
      });
    })();

    return () => unsub?.();
  }, [user]);

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
      <div className="bg-white rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden">
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
                <div key={item.id} className={`grid ${cols} gap-4 px-6 py-4 items-center`}>
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

                  {/* Details */}
                  <span className="text-sm text-gray-600 truncate" title={summarizeParams(item.params)}>
                    {summarizeParams(item.params)}
                  </span>

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
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
