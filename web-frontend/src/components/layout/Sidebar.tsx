"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home2,
  Sms,
  ClipboardTick,
  Hierarchy,
  Cpu,
  Code,
  Data,
  Profile2User,
  Chart2,
  Setting2,
  TaskSquare,
  Calendar1,
  ArrowLeft2,
  ArrowRight2,
} from "iconsax-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarContext";
import { ModeSwitcher } from "./ModeSwitcher";

const navItems = [
  { icon: Home2, label: "Dashboard", href: "/dashboard" },
  { icon: Sms, label: "Inbox", href: "/inbox" },
  { icon: ClipboardTick, label: "Approvals", href: "/approvals" },
  { icon: Hierarchy, label: "Integrations", href: "/integrations" },
  { icon: Cpu, label: "Agents", href: "/agents" },
  { icon: Code, label: "Website", href: "/website" },
  { icon: Data, label: "Data", href: "/data" },
  { icon: Profile2User, label: "Users", href: "/users" },
  { icon: TaskSquare, label: "Task Flow", href: "/tasks" },
  { icon: Calendar1, label: "Calendar", href: "/calendar" },
  { icon: Chart2, label: "Analytics", href: "/analytics" },
  { icon: Setting2, label: "Settings", href: "/settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 h-screen bg-white flex flex-col border-r border-gray-100 z-20 transition-all duration-200",
        collapsed ? "w-[70px] px-2 py-7" : "w-[230px] px-5 py-7"
      )}
    >
      {/* Logo */}
      <div className={cn("flex items-center mb-5", collapsed ? "justify-center" : "gap-2.5 px-2")}>
        <Image
          src="/ellipse-logo.png"
          alt="Ellipse"
          width={36}
          height={36}
          className="w-9 h-9 object-contain shrink-0"
          priority
        />
        {!collapsed && <span className="font-bold text-xl tracking-tight">Ellipse</span>}
      </div>

      {/* Navigation */}
      <nav className="flex-1 min-h-0 overflow-y-auto space-y-1.5 -mr-2 pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-full text-[15px] font-medium transition-colors",
                collapsed ? "justify-center w-11 h-11 mx-auto" : "gap-3.5 px-4 py-3",
                active
                  ? "bg-black text-white shadow-sm"
                  : "text-gray-500 hover:bg-gray-50"
              )}
            >
              <item.icon
                size={20}
                variant={active ? "Bold" : "Linear"}
                color={active ? "#ffffff" : "#9ca3af"}
              />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      {/* Mode switcher */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <ModeSwitcher collapsed={collapsed} />
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggle}
        className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mx-auto mt-4 hover:bg-gray-200 transition-colors"
      >
        {collapsed ? (
          <ArrowRight2 size={14} variant="Linear" color="#6b7280" />
        ) : (
          <ArrowLeft2 size={14} variant="Linear" color="#6b7280" />
        )}
      </button>

      {/* User Profile */}
      {!collapsed && (
        <div className="flex flex-col items-center pt-4 mt-4 border-t border-gray-100">
          <div className="relative mb-2">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 border-2 border-white shadow" />
            <span className="absolute -top-1 -right-1 bg-black text-white text-[10px] font-semibold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
              3
            </span>
          </div>
          <p className="text-[14px] font-semibold">George</p>
          <p className="text-xs text-gray-400">admin@ellipse.io</p>
        </div>
      )}

      {collapsed && (
        <div className="flex justify-center pt-4 mt-4 border-t border-gray-100">
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-300 to-gray-400" />
            <span className="absolute -top-1 -right-1 bg-black text-white text-[9px] font-semibold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">
              3
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}
