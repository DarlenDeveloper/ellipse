"use client";

import {
  LayoutDashboard,
  Inbox,
  Plug,
  Bot,
  BarChart3,
  Users,
  Settings,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/", active: true },
  { icon: Inbox, label: "Inbox", href: "/inbox" },
  { icon: Plug, label: "Connectors", href: "/connectors" },
  { icon: Bot, label: "Agents", href: "/agents" },
  { icon: Globe, label: "Web Agents", href: "/web-agents" },
  { icon: Users, label: "Users", href: "/users" },
  { icon: BarChart3, label: "Analytics", href: "/analytics" },
  { icon: Settings, label: "Settings", href: "/settings" },
];

export function Sidebar() {
  return (
    <aside className="flex flex-col w-[220px] bg-white rounded-2xl m-3 mr-0 p-4 shadow-sm">
      {/* Logo */}
      <div className="flex items-center gap-2 px-2 mb-8">
        <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">E</span>
        </div>
        <span className="font-semibold text-lg">Ellipse</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <a
            key={item.label}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
              item.active
                ? "bg-black text-white"
                : "text-gray-600 hover:bg-gray-100"
            )}
          >
            <item.icon size={18} />
            {item.label}
          </a>
        ))}
      </nav>

      {/* User Profile */}
      <div className="flex items-center gap-3 px-2 pt-4 border-t border-gray-100 mt-4">
        <div className="relative">
          <div className="w-10 h-10 bg-gray-300 rounded-full" />
          <span className="absolute -top-1 -right-1 bg-black text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
            3
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">George</p>
          <p className="text-xs text-gray-500 truncate">admin@ellipse.io</p>
        </div>
      </div>
    </aside>
  );
}
