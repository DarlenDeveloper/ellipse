"use client";

import {
  Home2,
  Sms,
  Hierarchy,
  Cpu,
  Global,
  Profile2User,
  Chart2,
  Setting2,
} from "iconsax-react";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: Home2, label: "Dashboard", href: "/", active: true },
  { icon: Sms, label: "Inbox", href: "/inbox" },
  { icon: Hierarchy, label: "Connectors", href: "/connectors" },
  { icon: Cpu, label: "Agents", href: "/agents" },
  { icon: Global, label: "Web Agents", href: "/web-agents" },
  { icon: Profile2User, label: "Users", href: "/users" },
  { icon: Chart2, label: "Analytics", href: "/analytics" },
  { icon: Setting2, label: "Settings", href: "/settings" },
];

export function Sidebar() {
  return (
    <aside className="flex flex-col w-[230px] bg-white px-5 py-7 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-2 mb-10">
        <div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center">
          <span className="text-white font-bold text-base">E</span>
        </div>
        <span className="font-bold text-xl tracking-tight">Ellipse</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1.5">
        {navItems.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className={cn(
              "flex items-center gap-3.5 px-4 py-3 rounded-full text-[15px] font-medium transition-colors",
              item.active
                ? "bg-black text-white shadow-sm"
                : "text-gray-500 hover:bg-gray-50"
            )}
          >
            <item.icon
              size={20}
              variant={item.active ? "Bold" : "Linear"}
              color={item.active ? "#ffffff" : "#9ca3af"}
            />
            {item.label}
          </a>
        ))}
      </nav>

      {/* User Profile */}
      <div className="flex flex-col items-center pt-6 mt-4">
        <div className="relative mb-2">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 border-2 border-white shadow" />
          <span className="absolute -top-1 -right-1 bg-black text-white text-[10px] font-semibold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
            3
          </span>
        </div>
        <p className="text-[15px] font-semibold">George</p>
        <p className="text-xs text-gray-400">admin@ellipse.io</p>
      </div>
    </aside>
  );
}
