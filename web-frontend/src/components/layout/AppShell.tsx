"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SidebarProvider, useSidebar } from "./SidebarContext";
import { ModeProvider } from "./ModeContext";
import { Sidebar } from "./Sidebar";

// Routes that render WITHOUT the app sidebar (pre-login / onboarding)
const bareRoutes = ["/login", "/signup", "/onboarding"];

function ShellInner({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <>
      <Sidebar />
      <div
        className="min-h-screen transition-all duration-200"
        style={{ marginLeft: collapsed ? 70 : 230 }}
      >
        {children}
      </div>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isBare = bareRoutes.some((r) => pathname.startsWith(r));

  if (isBare) {
    return <>{children}</>;
  }

  return (
    <ModeProvider>
      <SidebarProvider>
        <ShellInner>{children}</ShellInner>
      </SidebarProvider>
    </ModeProvider>
  );
}
