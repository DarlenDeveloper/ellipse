"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
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
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Statistics</h2>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-black rounded-full" />
            Messages
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-gray-400 rounded-full" />
            Agent Actions
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={12} />
          <YAxis axisLine={false} tickLine={false} fontSize={12} />
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "none",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
          />
          <Bar dataKey="messages" fill="#111111" radius={[4, 4, 0, 0]} barSize={14} />
          <Bar dataKey="agentActions" fill="#d1d5db" radius={[4, 4, 0, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
