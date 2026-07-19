"use client";

import { useEffect, useState } from "react";
import { TickCircle, CloseCircle, ClipboardTick } from "iconsax-react";
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

function formatDate(ts?: { toDate: () => Date }): string {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Render the action's params as readable key/value rows.
function paramRows(params?: Record<string, unknown>): { key: string; value: string }[] {
  if (!params) return [];
  const rows: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v && typeof v === "object") {
      for (const [fk, fv] of Object.entries(v as Record<string, unknown>)) {
        rows.push({ key: fk, value: String(fv) });
      }
    } else {
      rows.push({ key: k, value: String(v) });
    }
  }
  return rows;
}

export default function ApprovalsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

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
          .filter((r) => r.status === "pending")
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
      await updateDoc(doc(db, "pending_actions", id), { status, decided_at: serverTimestamp() });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="p-8 max-w-[900px]">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Approvals</h1>
        <p className="text-gray-400 mt-2">
          Actions your agents want to take. Approve to execute, or reject to discard.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-24 bg-white rounded-3xl border border-gray-100">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
            <ClipboardTick size={28} variant="Bold" color="#9ca3af" />
          </div>
          <p className="text-base font-semibold text-gray-700">All caught up</p>
          <p className="text-sm text-gray-400 mt-1">No actions waiting for approval.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-gray-100 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-bold">{agentLabel(item.agent_id)}</span>
                    <span className="text-xs font-medium text-gray-600 bg-gray-100 rounded-full px-2.5 py-1">
                      {actionLabel(item.action_type)}
                    </span>
                    {item.target_system && (
                      <span className="text-xs font-medium text-blue-600 bg-blue-50 rounded-full px-2.5 py-1">
                        {item.target_system}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{formatDate(item.created_at)}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => decide(item.id, "approved")}
                    disabled={busyId === item.id}
                    className="flex items-center gap-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg px-4 py-2 disabled:opacity-50"
                  >
                    <TickCircle size={16} variant="Bold" />
                    Approve
                  </button>
                  <button
                    onClick={() => decide(item.id, "rejected")}
                    disabled={busyId === item.id}
                    className="flex items-center gap-1.5 text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg px-4 py-2 disabled:opacity-50"
                  >
                    <CloseCircle size={16} variant="Bold" />
                    Reject
                  </button>
                </div>
              </div>

              {item.action_summary && (
                <p className="text-sm text-gray-600 mt-4 leading-relaxed border-t border-gray-100 pt-4">
                  {item.action_summary}
                </p>
              )}

              {paramRows(item.params).length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 bg-gray-50 rounded-xl p-4">
                  {paramRows(item.params).map((row, idx) => (
                    <div key={idx} className="flex flex-col min-w-0">
                      <span className="text-[11px] uppercase tracking-wide text-gray-400">{row.key}</span>
                      <span className="text-sm text-gray-800 truncate">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
