"use client";

import Link from "next/link";
import { Messages2, Hierarchy, Routing, Clock, Cpu, Data } from "iconsax-react";
import { useDashboardData } from "./DashboardData";

const cardPalette = {
  blue: { background: "linear-gradient(135deg, #D6E6FC 0%, #F0F6FE 100%)", shadow: "0 8px 18px rgba(67, 143, 242, 0.09)" },
  cyan: { background: "linear-gradient(135deg, #D5EEF5 0%, #F0F9FB 100%)", shadow: "0 8px 18px rgba(66, 179, 209, 0.09)" },
  indigo: { background: "linear-gradient(135deg, #DFE4FB 0%, #F3F5FE 100%)", shadow: "0 8px 18px rgba(110, 131, 237, 0.09)" },
  purple: { background: "linear-gradient(135deg, #E8E1F6 0%, #F7F4FC 100%)", shadow: "0 8px 18px rgba(149, 117, 216, 0.09)" },
};

export function QuickStats() {
  const { data, loading } = useDashboardData();
  const counts = data.counts;
  const stats = [
    { icon: Messages2, value: counts.messages, label: "Messages", detail: "Workspace conversations", href: "/inbox", palette: cardPalette.blue },
    { icon: Routing, value: counts.threads, label: "Open threads", detail: "Conversations in progress", href: "/inbox", palette: cardPalette.cyan },
    { icon: Clock, value: counts.pending, label: "Pending actions", detail: "Waiting for review", href: "/approvals", palette: cardPalette.indigo },
    { icon: Cpu, value: counts.agents, label: "Active agents", detail: "Automations at work", href: "/agents", palette: cardPalette.purple },
    { icon: Hierarchy, value: counts.channels, label: "Channels", detail: "Connected services", href: "/integrations", palette: cardPalette.blue },
    { icon: Data, value: counts.records, label: "CRM records", detail: "Available customer data", href: "/data", palette: cardPalette.cyan },
  ];

  return (
    <section aria-labelledby="workspace-pulse-title">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 id="workspace-pulse-title" className="text-[17px] font-semibold leading-6 tracking-[-0.015em] text-gray-950">Workspace pulse</h2>
          <p className="text-[12px] font-normal text-gray-400">Live activity across your connected tools</p>
        </div>
        <span className="hidden items-center gap-1.5 text-[11px] font-normal text-gray-400 sm:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Live
        </span>
      </div>

      <div className="-mx-1 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="grid min-w-[930px] grid-cols-6 gap-3">
          {stats.map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="flex h-[132px] min-w-0 flex-col rounded-[24px] border border-white/60 p-4 outline-none focus-visible:ring-2 focus-visible:ring-[#6E83ED] focus-visible:ring-offset-2"
              style={{ background: stat.palette.background, boxShadow: stat.palette.shadow }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <stat.icon size={18} variant="Linear" color="#17233A" className="shrink-0" />
                <p className="truncate text-[13px] font-medium tracking-[-0.01em] text-[#17233A]">{stat.label}</p>
              </div>
              <div className="mt-auto">
                {loading ? <span className="block h-6 w-14 animate-pulse rounded-md bg-white/50" /> : <p className="text-[24px] font-semibold leading-none tracking-[-0.025em] text-[#17233A]">{stat.value.toLocaleString()}</p>}
                <p className="mt-1.5 truncate text-[11px] font-normal text-[#66758C]">{stat.detail}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
