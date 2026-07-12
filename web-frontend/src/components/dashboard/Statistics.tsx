"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

const data = [
  { month: "Jan", messages: 4200, agentActions: 3100 },
  { month: "Feb", messages: 3800, agentActions: 2900 },
  { month: "Mar", messages: 5100, agentActions: 4200 },
  { month: "Apr", messages: 4600, agentActions: 3800 },
  { month: "May", messages: 5800, agentActions: 4900 },
  { month: "Jun", messages: 7200, agentActions: 6400 },
  { month: "Jul", messages: 6800, agentActions: 5900 },
  { month: "Aug", messages: 4900, agentActions: 4100 },
  { month: "Sep", messages: 5200, agentActions: 4400 },
  { month: "Oct", messages: 4800, agentActions: 3900 },
  { month: "Nov", messages: 5500, agentActions: 4600 },
  { month: "Dec", messages: 6100, agentActions: 5200 },
];

export function Statistics() {
  return (
    <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold tracking-tight">Statistics</h2>
        <div className="flex items-center gap-2 text-xs font-medium">
          <span className="flex items-center gap-1.5 bg-gray-900 text-white rounded-full px-3 py-1.5">
            <span className="w-2 h-2 bg-white rounded-full" />
            Messages
          </span>
          <span className="flex items-center gap-1.5 bg-gray-100 text-gray-600 rounded-full px-3 py-1.5">
            <span className="w-2 h-2 bg-gray-400 rounded-full" />
            Agent Actions
          </span>
        </div>
      </div>

      <div className="relative">
        {/* Floating tooltip bubble */}
        <div className="absolute left-[45%] top-[2%] z-10">
          <div className="bg-black text-white text-xs font-semibold rounded-full px-3 py-1.5 shadow-lg">
            6.4K
          </div>
          <div className="w-2 h-2 bg-black rounded-full mx-auto mt-1" />
        </div>

        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} barGap={3} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="0" vertical={false} stroke="#f3f3f3" />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              fontSize={11}
              tick={{ fill: "#9ca3af" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              fontSize={11}
              tick={{ fill: "#9ca3af" }}
              ticks={[0, 2000, 4000, 6000, 8000]}
            />
            <Bar dataKey="messages" fill="#111111" radius={[6, 6, 0, 0]} barSize={10} />
            <Bar dataKey="agentActions" fill="#e5e7eb" radius={[6, 6, 0, 0]} barSize={10} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
