"use client";

import { Messages2, Hierarchy, Routing, Clock, Cpu, Data } from "iconsax-react";
import { cn } from "@/lib/utils";
import { useDashboardData } from "./DashboardData";

export function QuickStats() {
  const { data } = useDashboardData();
  const counts = data.counts;

  const stats = [
    { icon: Messages2, value: counts.messages, label: "Messages" },
    { icon: Hierarchy, value: counts.channels, label: "Active Channels" },
    { icon: Routing, value: counts.threads, label: "Open Threads", highlight: true },
    { icon: Clock, value: counts.pending, label: "Pending Actions" },
    { icon: Cpu, value: counts.agents, label: "Active Agents" },
    { icon: Data, value: counts.records, label: "CRM Records" },
  ];

  return (
    <div className="flex gap-6 items-stretch">
      <div className="w-[150px] shrink-0 flex flex-col justify-center">
        <h2 className="text-2xl font-bold tracking-tight">Quick Stats</h2>
        <p className="text-sm text-gray-400 mt-2 leading-relaxed">Live across your workspace.</p>
      </div>

      <div className="flex-1 grid grid-cols-6 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={cn(
              "relative flex flex-col items-center text-center rounded-2xl px-3 py-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]",
              stat.highlight ? "bg-black text-white" : "bg-white"
            )}
          >
            <div
              className={cn(
                "w-11 h-11 rounded-full flex items-center justify-center mb-3",
                stat.highlight ? "bg-white/10" : "bg-gray-50"
              )}
            >
              <stat.icon size={20} variant="Bold" color={stat.highlight ? "#ffffff" : "#1a1a1a"} />
            </div>
            <span className="text-xl font-bold">{stat.value.toLocaleString()}</span>
            <span
              className={cn(
                "text-[11px] mt-1 leading-tight",
                stat.highlight ? "text-gray-300" : "text-gray-400"
              )}
            >
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
