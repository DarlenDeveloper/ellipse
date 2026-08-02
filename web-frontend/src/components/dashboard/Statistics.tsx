"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";
import { useDashboardData } from "./DashboardData";

type Granularity = "hourly" | "daily" | "weekly" | "monthly";
const GRANS: { id: Granularity; label: string; keep: number }[] = [
  { id: "hourly", label: "Hourly", keep: 24 },
  { id: "daily", label: "Daily", keep: 14 },
  { id: "weekly", label: "Weekly", keep: 8 },
  { id: "monthly", label: "Monthly", keep: 8 },
];

function bucketLabel(key: string, g: Granularity): string {
  if (g === "hourly") {
    const [, , , hh] = key.split("-");
    return `${hh}:00`;
  }
  if (g === "monthly") {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short" });
  }
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function Statistics() {
  const { data: dashboard, loading } = useDashboardData();
  const [metric, setMetric] = useState<"messages" | "agentActions">("messages");
  const [gran, setGran] = useState<Granularity>("daily");

  const data = useMemo(() => {
    const keep = GRANS.find((g) => g.id === gran)!.keep;
    const buckets = dashboard.charts[gran] ?? {};
    return Object.keys(buckets)
      .sort()
      .slice(-keep)
      .map((k) => ({ label: bucketLabel(k, gran), ...buckets[k] }));
  }, [dashboard.charts, gran]);

  return (
    <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
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

      {/* Granularity toggle */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 rounded-full p-1 w-fit">
        {GRANS.map((g) => (
          <button
            key={g.id}
            onClick={() => setGran(g.id)}
            className={cn(
              "text-xs font-medium rounded-full px-3 py-1 transition-colors",
              gran === g.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-[240px] items-end gap-5 border-b border-gray-100 px-7 pb-1 pt-8" aria-label="Loading statistics">
          {[28, 48, 34, 70, 52, 82, 64, 90, 58, 76, 42, 60].map((height, index) => (
            <span key={index} className="flex-1 animate-pulse rounded-t-md bg-gray-100" style={{ height: `${height}%` }} />
          ))}
        </div>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-400 py-20 text-center">No activity yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} barGap={3} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="0" vertical={false} stroke="#f3f3f3" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#9ca3af" }} minTickGap={16} />
            <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#9ca3af" }} allowDecimals={false} />
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
