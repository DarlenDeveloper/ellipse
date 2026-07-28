"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  LogoutCurve,
} from "iconsax-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarContext";
import { useAuth } from "@/lib/auth-context";
import { useAccess } from "@/lib/use-access";

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
  const router = useRouter();
  const { collapsed, toggle, navigationHref, startNavigation, finishNavigation } = useSidebar();
  const { logout } = useAuth();
  const { isManager, loading: accessLoading } = useAccess();
  const [signingOut, setSigningOut] = useState(false);

  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
      router.replace("/login");
    } finally {
      setSigningOut(false);
    }
  };

  useEffect(() => {
    finishNavigation();
  }, [pathname, finishNavigation]);

  useEffect(() => {
    navItems.filter((item) => item.href !== "/users" || isManager).forEach((item) => router.prefetch(item.href));
  }, [router, isManager]);

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 h-screen bg-white flex flex-col border-r border-gray-100 z-20 transition-all duration-200",
        collapsed ? "w-[70px] px-2 py-7" : "w-[230px] px-5 py-7"
      )}
    >
      {/* Logo */}
      <div className={cn("flex items-center mb-5", collapsed ? "justify-center" : "px-2")}>
        <Image
          src="/mercury-logo.png"
          alt="Mercury Computers"
          width={180}
          height={48}
          className={cn("object-contain", collapsed ? "w-11 h-11" : "h-11 w-auto")}
          priority
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 min-h-0 overflow-y-auto space-y-1.5 -mr-2 pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {navItems.filter((item) => item.href !== "/users" || (!accessLoading && isManager)).map((item) => {
          const active = navigationHref
            ? navigationHref === item.href
            : pathname.startsWith(item.href);
          const pending = navigationHref === item.href && !pathname.startsWith(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              prefetch
              onClick={() => {
                if (!pathname.startsWith(item.href)) startNavigation(item.href);
              }}
              aria-current={active ? "page" : undefined}
              aria-busy={pending || undefined}
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

      {/* Pinned footer — account action + collapse toggle (never scrolls) */}
      <div className="shrink-0 pt-3 mt-2 border-t border-gray-100 space-y-2">
        <button
          type="button"
          onClick={handleLogout}
          disabled={signingOut}
          title={collapsed ? "Log out" : undefined}
          className={cn(
            "flex items-center rounded-full text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50",
            collapsed ? "justify-center w-11 h-11 mx-auto" : "w-full gap-3.5 px-4 py-2.5"
          )}
        >
          <LogoutCurve size={20} variant="Linear" color="currentColor" />
          {!collapsed && (signingOut ? "Logging out…" : "Log out")}
        </button>
        <button
          type="button"
          onClick={toggle}
          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mx-auto hover:bg-gray-200 transition-colors"
        >
          {collapsed ? (
            <ArrowRight2 size={14} variant="Linear" color="#6b7280" />
          ) : (
            <ArrowLeft2 size={14} variant="Linear" color="#6b7280" />
          )}
        </button>
      </div>
    </aside>
  );
}
