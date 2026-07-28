"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type SidebarContextType = {
  collapsed: boolean;
  toggle: () => void;
  navigationHref: string | null;
  startNavigation: (href: string) => void;
  finishNavigation: () => void;
};

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  toggle: () => {},
  navigationHref: null,
  startNavigation: () => {},
  finishNavigation: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [navigationHref, setNavigationHref] = useState<string | null>(null);
  const toggle = useCallback(() => setCollapsed((current) => !current), []);
  const startNavigation = useCallback((href: string) => setNavigationHref(href), []);
  const finishNavigation = useCallback(() => setNavigationHref(null), []);
  return (
    <SidebarContext.Provider value={{
      collapsed,
      toggle,
      navigationHref,
      startNavigation,
      finishNavigation,
    }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
