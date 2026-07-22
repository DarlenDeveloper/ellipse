"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SidebarProvider, useSidebar } from "./SidebarContext";
import { ModeProvider } from "./ModeContext";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Sidebar } from "./Sidebar";
import { IvyBubble } from "@/components/ivy/IvyBubble";

// Routes that render WITHOUT the app sidebar (pre-login / onboarding)
const bareRoutes = ["/login", "/signup", "/onboarding"];

function ShellInner({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  // While checking auth or redirecting, show a minimal loader
  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f7f8]">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Sidebar />
      <div
        className="min-h-screen transition-all duration-200"
        style={{ marginLeft: collapsed ? 70 : 230 }}
      >
        {children}
      </div>
      {pathname !== "/ivy" && <IvyBubble />}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isBare = bareRoutes.some((r) => pathname.startsWith(r));

  if (isBare) {
    return <AuthProvider>{children}</AuthProvider>;
  }

  return (
    <AuthProvider>
      <ModeProvider>
        <SidebarProvider>
          <ShellInner>{children}</ShellInner>
        </SidebarProvider>
      </ModeProvider>
    </AuthProvider>
  );
}
