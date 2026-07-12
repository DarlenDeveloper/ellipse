"use client";

import {
  Messages2,
  Hierarchy,
  Routing,
  Clock,
  Cpu,
  Warning2,
  ArrowRight,
} from "iconsax-react";
import { cn } from "@/lib/utils";

const stats = [
  { icon: Messages2, value: "12.4K", label: "Total Messages" },
  { icon: Hierarchy, value: "5", label: "Active Channels" },
  { icon: Routing, value: "1.8K", label: "Active Threads", highlight: true },
  { icon: Clock, value: "340", label: "Pending Actions" },
  { icon: Cpu, value: "8", label: "Active Agents" },
  { icon: Warning2, value: "12", label: "Reported Issues" },
];

export function QuickStats() {
  return (
    <div className="flex gap-6 items-stretch">
      {/* Left heading */}
      <div className="w-[150px] shrink-0 flex flex-col justify-center">
        <h2 className="text-2xl font-bold tracking-tight">Quick Stats</h2>
        <p className="text-sm text-gray-400 mt-2 leading-relaxed">
          Your statistics for 1 week period.
        </p>
      </div>

      {/* Stat cards */}
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
              <stat.icon
                size={20}
                variant="Bold"
                color={stat.highlight ? "#ffffff" : "#1a1a1a"}
              />
            </div>
            <span className="text-xl font-bold">{stat.value}</span>
            <span
              className={cn(
                "text-[11px] mt-1 leading-tight",
                stat.highlight ? "text-gray-300" : "text-gray-400"
              )}
            >
              {stat.label}
            </span>
            {stat.highlight && (
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-7 h-7 bg-white rounded-full shadow-md flex items-center justify-center">
                <ArrowRight size={14} variant="Linear" color="#1a1a1a" className="rotate-[-45deg]" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
