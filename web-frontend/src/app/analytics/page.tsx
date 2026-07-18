"use client";

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
} from "recharts";
import { ArrowUp, ArrowDown, Messages2, Clock, TickCircle, Warning2 } from "iconsax-react";
import { cn } from "@/lib/utils";

const kpis = [
  { label: "Total Messages", value: "12.4K", change: "+18%", up: true, icon: Messages2 },
  { label: "Avg. Response Time", value: "4.2 min", change: "-32%", up: true, icon: Clock },
  { label: "Resolution Rate", value: "87%", change: "+5%", up: true, icon: TickCircle },
  { label: "Escalation Rate", value: "3.2%", change: "+0.8%", up: false, icon: Warning2 },
];

const volumeData = [
  { month: "Jan", gmail: 2400, whatsapp: 1800, smtp: 900 },
  { month: "Feb", gmail: 2100, whatsapp: 2200, smtp: 800 },
  { month: "Mar", gmail: 3100, whatsapp: 2600, smtp: 1100 },
  { month: "Apr", gmail: 2800, whatsapp: 3000, smtp: 950 },
  { month: "May", gmail: 3400, whatsapp: 2900, smtp: 1200 },
  { month: "Jun", gmail: 3800, whatsapp: 3400, smtp: 1300 },
  { month: "Jul", gmail: 3200, whatsapp: 3100, smtp: 1100 },
];

const responseTimeData = [
  { month: "Jan", time: 8.2 },
  { month: "Feb", time: 7.1 },
  { month: "Mar", time: 6.4 },
  { month: "Apr", time: 5.8 },
  { month: "May", time: 5.1 },
  { month: "Jun", time: 4.5 },
  { month: "Jul", time: 4.2 },
];

const sentimentData = [
  { name: "Positive", value: 58, color: "#22c55e" },
  { name: "Neutral", value: 28, color: "#eab308" },
  { name: "Negative", value: 14, color: "#ef4444" },
];

const agentPerformance = [
  { name: "Gmail Agent", handled: 4200, overrides: 120, rate: "97%" },
  { name: "WhatsApp Agent", handled: 3800, overrides: 210, rate: "94%" },
  { name: "SMTP Agent", handled: 1100, overrides: 85, rate: "92%" },
  { name: "Boss Agent", handled: 890, overrides: 45, rate: "95%" },
  { name: "Web Agent", handled: 340, overrides: 22, rate: "94%" },
];

export default function AnalyticsPage() {
  return (
    <main className="p-8 space-y-6">
      {/* Header */}
      <div className="mb-2">
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-gray-400 mt-1">Performance metrics across all channels and agents.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                <kpi.icon size={20} variant="Bold" color="#1a1a1a" />
              </div>
              <span className={cn("flex items-center gap-1 text-xs font-medium", kpi.up ? "text-green-600" : "text-red-500")}>
                {kpi.up ? <ArrowUp size={12} variant="Linear" /> : <ArrowDown size={12} variant="Linear" />}
                {kpi.change}
              </span>
            </div>
            <p className="text-2xl font-bold">{kpi.value}</p>
            <p className="text-xs text-gray-400 mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-[1fr_340px] gap-6">
        {/* Volume chart */}
        <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold">Message Volume by Channel</h2>
            <div className="flex items-center gap-3 text-xs font-medium">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-red-400 rounded-full" />Gmail</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-green-400 rounded-full" />WhatsApp</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-slate-400 rounded-full" />SMTP</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={volumeData} barGap={2}>
              <CartesianGrid strokeDasharray="0" vertical={false} stroke="#f3f3f3" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#9ca3af" }} />
              <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#9ca3af" }} />
              <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
              <Bar dataKey="gmail" fill="#f87171" radius={[4, 4, 0, 0]} barSize={12} />
              <Bar dataKey="whatsapp" fill="#4ade80" radius={[4, 4, 0, 0]} barSize={12} />
              <Bar dataKey="smtp" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Sentiment Pie */}
        <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <h2 className="text-lg font-bold mb-4">Sentiment</h2>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={sentimentData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                dataKey="value"
                strokeWidth={0}
              >
                {sentimentData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-4 mt-2">
            {sentimentData.map((s) => (
              <span key={s.name} className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name} {s.value}%
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Response time + Agent performance */}
      <div className="grid grid-cols-2 gap-6">
        {/* Response time trend */}
        <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <h2 className="text-lg font-bold mb-6">Avg. Response Time (min)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={responseTimeData}>
              <CartesianGrid strokeDasharray="0" vertical={false} stroke="#f3f3f3" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#9ca3af" }} />
              <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#9ca3af" }} />
              <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
              <Line type="monotone" dataKey="time" stroke="#111111" strokeWidth={2.5} dot={{ r: 4, fill: "#111111" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Agent performance table */}
        <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <h2 className="text-lg font-bold mb-5">Agent Performance</h2>
          <div className="space-y-1">
            <div className="grid grid-cols-[1fr_80px_80px_60px] text-xs text-gray-400 font-medium px-3 py-2">
              <span>Agent</span>
              <span>Handled</span>
              <span>Overrides</span>
              <span>Rate</span>
            </div>
            {agentPerformance.map((a) => (
              <div key={a.name} className="grid grid-cols-[1fr_80px_80px_60px] text-sm px-3 py-2.5 rounded-xl hover:bg-gray-50">
                <span className="font-medium">{a.name}</span>
                <span className="text-gray-600">{a.handled.toLocaleString()}</span>
                <span className="text-gray-600">{a.overrides}</span>
                <span className="font-semibold text-green-600">{a.rate}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
