"use client";

import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { Chart, Messages2, Cpu } from "iconsax-react";
import { cn } from "@/lib/utils";
import { useDashboardData } from "./DashboardData";

type Granularity = "hourly" | "daily" | "weekly" | "monthly";
const GRANS: { id: Granularity; label: string; keep: number }[] = [
  { id: "hourly", label: "24 hours", keep: 24 },
  { id: "daily", label: "14 days", keep: 14 },
  { id: "weekly", label: "8 weeks", keep: 8 },
  { id: "monthly", label: "8 months", keep: 8 },
];

function bucketLabel(key: string, granularity: Granularity): string {
  if (granularity === "hourly") { const [, , , hour] = key.split("-"); return `${hour}:00`; }
  if (granularity === "monthly") { const [year, month] = key.split("-").map(Number); return new Date(year, month - 1, 1).toLocaleString(undefined, { month: "short" }); }
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function Statistics() {
  const { data: dashboard, loading } = useDashboardData();
  const [metric, setMetric] = useState<"messages" | "agentActions">("messages");
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const data = useMemo(() => {
    const keep = GRANS.find((item) => item.id === granularity)!.keep;
    const buckets = dashboard.charts[granularity] ?? {};
    return Object.keys(buckets).sort().slice(-keep).map((key) => ({ label: bucketLabel(key, granularity), ...buckets[key] }));
  }, [dashboard.charts, granularity]);
  const total = data.reduce((sum, row) => sum + Number(row[metric] ?? 0), 0);

  return (
    <section className="rounded-[24px] border border-black/[0.04] bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.035)]" aria-labelledby="activity-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-2.5">
          <Chart size={19} variant="Linear" color="#3767c7" className="mt-0.5 shrink-0" />
          <div>
            <h2 id="activity-title" className="text-[17px] font-semibold leading-6 tracking-[-0.015em] text-gray-950">Workspace activity</h2>
            <p className="text-[12px] font-normal text-gray-400">How work is moving across your channels</p>
          </div>
        </div>
        <div className="flex w-fit rounded-full bg-gray-100 p-1">
          {GRANS.map((item) => (
            <button key={item.id} onClick={() => setGranularity(item.id)} className={cn("rounded-full px-3 py-1 text-[11px] font-medium", granularity === item.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-400")}>{item.label}</button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-normal text-gray-400">Total in period</p>
          <p className="mt-0.5 text-[24px] font-semibold leading-7 tracking-[-0.025em] text-gray-950">{loading ? "—" : total.toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMetric("messages")} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium", metric === "messages" ? "bg-gray-950 text-white" : "bg-gray-100 text-gray-500")}><Messages2 size={13} color="currentColor" /> Messages</button>
          <button onClick={() => setMetric("agentActions")} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium", metric === "agentActions" ? "bg-gray-950 text-white" : "bg-gray-100 text-gray-500")}><Cpu size={13} color="currentColor" /> Agent actions</button>
        </div>
      </div>

      <div className="mt-2 h-[180px]">
        {loading ? (
          <div className="flex h-full items-end gap-3 border-b border-gray-100 px-4 pb-1">{[28,48,34,70,52,82,64,90,58,76,42,60].map((height, index) => <span key={index} className="flex-1 animate-pulse rounded-t-lg bg-gray-100" style={{ height: `${height}%` }} />)}</div>
        ) : data.length === 0 ? (
          <div className="grid h-full place-items-center rounded-2xl bg-gray-50/70 text-[13px] font-normal text-gray-400">Activity will appear here as your workspace gets moving.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f0f1f3" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={10} tick={{ fill: "#9ca3af" }} minTickGap={18} />
              <YAxis axisLine={false} tickLine={false} fontSize={10} tick={{ fill: "#9ca3af" }} allowDecimals={false} />
              <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: "12px", border: "1px solid #f1f1f1", boxShadow: "0 8px 24px rgba(0,0,0,.07)", fontSize: "11px" }} />
              <Bar dataKey={metric} name={metric === "messages" ? "Messages" : "Agent actions"} fill={metric === "messages" ? "#111827" : "#7c8cff"} radius={[6,6,2,2]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
