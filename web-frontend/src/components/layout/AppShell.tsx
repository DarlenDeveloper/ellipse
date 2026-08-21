"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SidebarProvider, useSidebar } from "./SidebarContext";
import { ModeProvider } from "./ModeContext";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Sidebar } from "./Sidebar";
import { IvyBubble } from "@/components/ivy/IvyBubble";
import { NotificationCenter } from "./NotificationCenter";
import { PushPermissionPrompt } from "./PushPermissionPrompt";

// Routes that render WITHOUT the app sidebar (pre-login / onboarding)
const bareRoutes = ["/login", "/signup", "/onboarding", "/terms", "/privacy"];

function ShellInner({ children }: { children: ReactNode }) {
  const { collapsed, navigationHref } = useSidebar();
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
      <PushPermissionPrompt />
      {pathname !== "/inbox" && <NotificationCenter />}
      <div
        className="min-h-screen transition-all duration-200"
        style={{ marginLeft: collapsed ? 70 : 230 }}
      >
        {navigationHref && navigationHref !== pathname ? <InstantPageTransition /> : children}
      </div>
      {pathname !== "/ivy" && <IvyBubble />}
    </>
  );
}

function InstantPageTransition() {
  return (
    <main className="min-h-screen bg-[#f7f7f8] p-8" role="status" aria-label="Loading page">
      <div className="animate-pulse">
        <div className="h-10 w-56 rounded-xl bg-gray-200/80" />
        <div className="mt-3 h-5 w-[420px] max-w-full rounded-lg bg-gray-200/60" />
        <div className="mt-10 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="h-64 rounded-[28px] bg-white shadow-sm" />
          <div className="h-64 rounded-[28px] bg-white shadow-sm" />
          <div className="h-64 rounded-[28px] bg-white shadow-sm" />
          <div className="h-64 rounded-[28px] bg-white shadow-sm" />
        </div>
      </div>
    </main>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The root page performs a server redirect to /login. It must render outside
  // the protected shell; otherwise the auth spinner hides it before the
  // redirect can complete for signed-out users.
  const isBare = pathname === "/" || bareRoutes.some((r) => pathname.startsWith(r));

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
