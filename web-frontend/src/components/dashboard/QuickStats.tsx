"use client";

import { MessageSquare, Plug, GitMerge, Clock, Bot, AlertTriangle } from "lucide-react";

const stats = [
  { icon: MessageSquare, value: "12.4K", label: "Total Messages", color: "text-gray-700" },
  { icon: Plug, value: "5", label: "Active Channels", color: "text-gray-700" },
  { icon: GitMerge, value: "1.8K", label: "Active Threads", color: "text-blue-600", highlight: true },
  { icon: Clock, value: "340", label: "Pending Actions", color: "text-gray-700" },
  { icon: Bot, value: "8", label: "Active Agents", color: "text-gray-700" },
  { icon: AlertTriangle, value: "12", label: "Escalations", color: "text-gray-700" },
];

export function QuickStats() {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">Quick Stats</h2>
          <p className="text-sm text-gray-500">Your statistics for 1 week period.</p>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={cn(
              "flex flex-col items-center p-3 rounded-xl",
              stat.highlight ? "bg-blue-50" : "bg-gray-50"
            )}
          >
            <stat.icon size={20} className={stat.color} />
            <span className="text-xl font-bold mt-2">{stat.value}</span>
            <span className="text-xs text-gray-500 text-center mt-1">{stat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
