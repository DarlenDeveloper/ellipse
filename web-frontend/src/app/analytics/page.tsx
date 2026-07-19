"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Messages2, Data, TickCircle, Clock } from "iconsax-react";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

type Ev = { source?: string; payload?: Record<string, unknown>; timestamp?: { toDate: () => Date } };
type Action = { agent_id?: string; status?: string };

const channelLabel: Record<string, string> = {
  "google-workspace": "Gmail",
  zoho: "Zoho",
  whatsapp: "WhatsApp",
  odoo: "Odoo",
  salesforce: "Salesforce",
  microsoft365: "Microsoft 365",
};
const channelColor: Record<string, string> = {
  Gmail: "#f87171",
  Zoho: "#a78bfa",
  WhatsApp: "#4ade80",
  Odoo: "#c084fc",
  Salesforce: "#38bdf8",
  "Microsoft 365": "#fb923c",
};
const outcomeColors: Record<string, string> = {
  Executed: "#22c55e",
  Pending: "#eab308",
  Rejected: "#ef4444",
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthShort(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short" });
}

function agentLabel(agentId?: string): string {
  if (!agentId) return "Agent";
  return agentId
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<Ev[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let unsubE: (() => void) | undefined;
    let unsubA: (() => void) | undefined;
    (async () => {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const enterpriseId = userSnap.data()?.enterprise_id as string | undefined;
      if (!enterpriseId) {
        setLoading(false);
        return;
      }
      unsubE = onSnapshot(
        query(collection(db, "analytics_events"), where("workspace_id", "==", enterpriseId)),
        (snap) => {
          setEvents(snap.docs.map((d) => d.data() as Ev));
          setLoading(false);
        }
      );
      unsubA = onSnapshot(
        query(collection(db, "pending_actions"), where("enterprise_id", "==", enterpriseId)),
        (snap) => setActions(snap.docs.map((d) => d.data() as Action))
      );
    })();
    return () => {
      unsubE?.();
      unsubA?.();
    };
  }, [user]);

  const stats = useMemo(() => {
    const messages = events.filter((e) => e.source === "message");
    const records = events.filter((e) => e.source === "zoho_record");
    const executed = actions.filter((a) => a.status === "executed" || a.status === "approved").length;
    const pending = actions.filter((a) => a.status === "pending").length;
    const rejected = actions.filter((a) => a.status === "rejected").length;

    // Monthly volume by channel
    const channels = new Set<string>();
    const buckets: Record<string, Record<string, number>> = {};
    for (const e of [...messages, ...records]) {
      const d = e.timestamp?.toDate?.();
      if (!d) continue;
      const raw = (e.payload?.channel as string) ?? (e.source === "zoho_record" ? "zoho" : "other");
      const ch = channelLabel[raw] ?? raw;
      channels.add(ch);
      const k = monthKey(d);
      (buckets[k] ??= {})[ch] = ((buckets[k] ??= {})[ch] ?? 0) + 1;
    }
    const orderedKeys = Object.keys(buckets).sort().slice(-8);
    const volume = orderedKeys.map((k) => ({ month: monthShort(k), ...buckets[k] }));

    // Activity trend (all events per month)
    const trendBuckets: Record<string, number> = {};
    for (const e of events) {
      const d = e.timestamp?.toDate?.();
      if (!d) continue;
      const k = monthKey(d);
      trendBuckets[k] = (trendBuckets[k] ?? 0) + 1;
    }
    const trend = Object.keys(trendBuckets)
      .sort()
      .slice(-8)
      .map((k) => ({ month: monthShort(k), events: trendBuckets[k] }));

    // Action outcomes
    const outcomes = [
      { name: "Executed", value: executed, color: outcomeColors.Executed },
      { name: "Pending", value: pending, color: outcomeColors.Pending },
      { name: "Rejected", value: rejected, color: outcomeColors.Rejected },
    ].filter((o) => o.value > 0);

    // Agent performance
    const byAgent: Record<string, { handled: number; overrides: number }> = {};
    for (const a of actions) {
      const id = a.agent_id ?? "unknown";
      const g = (byAgent[id] ??= { handled: 0, overrides: 0 });
      if (a.status === "executed" || a.status === "approved") g.handled++;
      if (a.status === "rejected") g.overrides++;
    }
    const agentPerf = Object.entries(byAgent).map(([id, g]) => {
      const denom = g.handled + g.overrides;
      return {
        name: agentLabel(id),
        handled: g.handled,
        overrides: g.overrides,
        rate: denom ? `${Math.round((g.handled / denom) * 100)}%` : "—",
      };
    });

    return {
      totalMessages: messages.length,
      totalRecords: records.length,
      executed,
      pending,
      channels: [...channels],
      volume,
      trend,
      outcomes,
      agentPerf,
    };
  }, [events, actions]);

  const kpis = [
    { label: "Messages Ingested", value: stats.totalMessages.toLocaleString(), icon: Messages2 },
    { label: "CRM Records", value: stats.totalRecords.toLocaleString(), icon: Data },
    { label: "Actions Executed", value: stats.executed.toLocaleString(), icon: TickCircle },
    { label: "Pending Actions", value: stats.pending.toLocaleString(), icon: Clock },
  ];

  return (
    <main className="p-8 space-y-6">
      <div className="mb-2">
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-gray-400 mt-1">Live metrics across your channels and agents.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center mb-3">
              <kpi.icon size={20} variant="Bold" color="#1a1a1a" />
            </div>
            <p className="text-2xl font-bold">{loading ? "—" : kpi.value}</p>
            <p className="text-xs text-gray-400 mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Volume + outcomes */}
      <div className="grid grid-cols-[1fr_340px] gap-6">
        <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold">Volume by Channel</h2>
            <div className="flex items-center gap-3 text-xs font-medium">
              {stats.channels.map((ch) => (
                <span key={ch} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: channelColor[ch] ?? "#94a3b8" }} />
                  {ch}
                </span>
              ))}
            </div>
          </div>
          {stats.volume.length === 0 ? (
            <p className="text-sm text-gray-400 py-16 text-center">No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.volume} barGap={2}>
                <CartesianGrid strokeDasharray="0" vertical={false} stroke="#f3f3f3" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#9ca3af" }} />
                <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#9ca3af" }} />
                <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                {stats.channels.map((ch) => (
                  <Bar key={ch} dataKey={ch} fill={channelColor[ch] ?? "#94a3b8"} radius={[4, 4, 0, 0]} barSize={12} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <h2 className="text-lg font-bold mb-4">Action Outcomes</h2>
          {stats.outcomes.length === 0 ? (
            <p className="text-sm text-gray-400 py-16 text-center">No actions yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={stats.outcomes} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" strokeWidth={0}>
                    {stats.outcomes.map((o) => (
                      <Cell key={o.name} fill={o.color} />
                    ))}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-4 mt-2">
                {stats.outcomes.map((o) => (
                  <span key={o.name} className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: o.color }} />
                    {o.name} {o.value}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Activity trend + agent performance */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <h2 className="text-lg font-bold mb-6">Activity Trend (events/month)</h2>
          {stats.trend.length === 0 ? (
            <p className="text-sm text-gray-400 py-16 text-center">No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={stats.trend}>
                <CartesianGrid strokeDasharray="0" vertical={false} stroke="#f3f3f3" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#9ca3af" }} />
                <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#9ca3af" }} />
                <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
                <Line type="monotone" dataKey="events" stroke="#111111" strokeWidth={2.5} dot={{ r: 4, fill: "#111111" }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <h2 className="text-lg font-bold mb-5">Agent Performance</h2>
          {stats.agentPerf.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No agent activity yet.</p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-[1fr_80px_80px_60px] text-xs text-gray-400 font-medium px-3 py-2">
                <span>Agent</span>
                <span>Handled</span>
                <span>Overrides</span>
                <span>Rate</span>
              </div>
              {stats.agentPerf.map((a) => (
                <div key={a.name} className="grid grid-cols-[1fr_80px_80px_60px] text-sm px-3 py-2.5 rounded-xl hover:bg-gray-50">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-gray-600">{a.handled.toLocaleString()}</span>
                  <span className="text-gray-600">{a.overrides}</span>
                  <span className="font-semibold text-green-600">{a.rate}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
