"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sms, ArrowRight2 } from "iconsax-react";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

type PendingAction = {
  id: string;
  agent_id?: string;
  action_type?: string;
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
  if (!actionType) return "";
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

export function PendingApprovals() {
  const { user } = useAuth();
  const [items, setItems] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold tracking-tight">
          Pending Approvals
          {items.length > 0 && (
            <span className="ml-2 text-sm font-semibold text-white bg-black rounded-full px-2 py-0.5">
              {items.length}
            </span>
          )}
        </h2>
        <Link href="/approvals" className="text-gray-400 hover:text-gray-700" title="View all">
          <ArrowRight2 size={20} variant="Linear" />
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400">No actions waiting for approval.</p>
      ) : (
        <div className="space-y-5">
          {items.slice(0, 4).map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                  <Sms size={20} variant="Bold" color="#1a1a1a" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{agentLabel(item.agent_id)}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {actionLabel(item.action_type)} · {formatDate(item.created_at)}
                  </p>
                </div>
              </div>
              <span className="text-xs font-medium border border-gray-200 rounded-full px-3 py-1.5 text-gray-500 shrink-0">
                Pending
              </span>
            </div>
          ))}

          <Link
            href="/approvals"
            className="flex items-center justify-center gap-1 text-sm font-medium text-gray-600 hover:text-black pt-1"
          >
            Review all
            <ArrowRight2 size={14} variant="Linear" />
          </Link>
        </div>
      )}
    </div>
  );
}
