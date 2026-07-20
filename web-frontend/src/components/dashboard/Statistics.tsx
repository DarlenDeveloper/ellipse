"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { db } from "@/lib/firebase";
import { useEnterpriseId } from "@/lib/use-enterprise";

type Ev = { source?: string; timestamp?: { toDate: () => Date } };
type Action = { status?: string; created_at?: { toDate: () => Date } };

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthShort(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short" });
}

export function Statistics() {
  const { enterpriseId } = useEnterpriseId();
  const [events, setEvents] = useState<Ev[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [metric, setMetric] = useState<"messages" | "agentActions">("messages");

  useEffect(() => {
    if (!enterpriseId) return;
    const unsubs: (() => void)[] = [];
    unsubs.push(
      onSnapshot(
        query(collection(db, "analytics_events"), where("workspace_id", "==", enterpriseId)),
        (snap) => setEvents(snap.docs.map((d) => d.data() as Ev))
      )
    );
    unsubs.push(
      onSnapshot(
        query(collection(db, "pending_actions"), where("enterprise_id", "==", enterpriseId)),
        (snap) => setActions(snap.docs.map((d) => d.data() as Action))
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [enterpriseId]);

  const data = useMemo(() => {
    const buckets: Record<string, { messages: number; agentActions: number }> = {};
    for (const e of events) {
      if (e.source !== "message") continue;
      const d = e.timestamp?.toDate?.();
      if (!d) continue;
      (buckets[monthKey(d)] ??= { messages: 0, agentActions: 0 }).messages++;
    }
    for (const a of actions) {
      const d = a.created_at?.toDate?.();
      if (!d) continue;
      (buckets[monthKey(d)] ??= { messages: 0, agentActions: 0 }).agentActions++;
    }
    return Object.keys(buckets)
      .sort()
      .slice(-8)
      .map((k) => ({ month: monthShort(k), ...buckets[k] }));
  }, [events, actions]);

  return (
    <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold tracking-tight">Statistics</h2>
        <div className="flex items-center gap-2 text-xs font-medium">
          <button
            onClick={() => setMetric("messages")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors",
              metric === "messages" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            <span className={cn("w-2 h-2 rounded-full", metric === "messages" ? "bg-white" : "bg-gray-400")} />
            Messages
          </button>
          <button
            onClick={() => setMetric("agentActions")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors",
              metric === "agentActions" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            <span className={cn("w-2 h-2 rounded-full", metric === "agentActions" ? "bg-white" : "bg-gray-400")} />
            Agent Actions
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-gray-400 py-20 text-center">No activity yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} barGap={3} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="0" vertical={false} stroke="#f3f3f3" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#9ca3af" }} />
            <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#9ca3af" }} />
            <Tooltip
              cursor={false}
              contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
            />
            <Bar
              dataKey={metric}
              name={metric === "messages" ? "Messages" : "Agent Actions"}
              fill={metric === "messages" ? "#111111" : "#9ca3af"}
              radius={[6, 6, 0, 0]}
              barSize={14}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
