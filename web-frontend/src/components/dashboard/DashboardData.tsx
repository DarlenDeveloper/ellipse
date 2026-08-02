"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useAccess } from "@/lib/use-access";

export type DashboardCounts = { messages: number; channels: number; threads: number; pending: number; agents: number; records: number };
export type DashboardBucket = { messages: number; agentActions: number };
export type DashboardPending = { id: string; agent_id?: string; target_system?: string; action_type?: string; status?: string; created_at?: string | null };
export type DashboardThread = { id: string; subject?: string; customer_ref?: string; channel?: string; status?: string; last_message_at?: string | null };
export type DashboardPayload = {
  counts: DashboardCounts;
  charts: Record<"hourly" | "daily" | "weekly" | "monthly", Record<string, DashboardBucket>>;
  pendingApprovals: DashboardPending[];
  recentThreads: DashboardThread[];
  generatedAt: string;
  cached?: boolean;
};

const EMPTY: DashboardPayload = {
  counts: { messages: 0, channels: 0, threads: 0, pending: 0, agents: 0, records: 0 },
  charts: { hourly: {}, daily: {}, weekly: {}, monthly: {} },
  pendingApprovals: [], recentThreads: [], generatedAt: "",
};
const DashboardContext = createContext<{ data: DashboardPayload; loading: boolean; error: string | null }>({ data: EMPTY, loading: true, error: null });
const BROWSER_CACHE_MS = 2 * 60_000;

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { enterpriseId, isManager, grantedTypes, loading: accessLoading } = useAccess();
  const [data, setData] = useState<DashboardPayload>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scopeKey = useMemo(() => isManager ? "org" : [...grantedTypes].sort().join(","), [isManager, grantedTypes]);

  useEffect(() => {
    if (accessLoading || !user || !enterpriseId) return;
    const cacheKey = `ellipse_dashboard_${enterpriseId}_${user.uid}_${scopeKey}`;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null") as { savedAt: number; payload: DashboardPayload } | null;
      if (cached && Date.now() - cached.savedAt < BROWSER_CACHE_MS) {
        setData(cached.payload);
        setLoading(false);
        return;
      }
    } catch {
      localStorage.removeItem(cacheKey);
    }

    let active = true;
    setLoading(true);
    setError(null);
    httpsCallable(functions, "getDashboardData")({ enterpriseId }).then((result) => {
      if (!active) return;
      const payload = result.data as DashboardPayload;
      setData(payload);
      setLoading(false);
      try { localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), payload })); } catch { /* storage unavailable */ }
    }).catch((cause) => {
      if (!active) return;
      setError((cause as Error).message || "Dashboard could not be loaded.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [accessLoading, enterpriseId, scopeKey, user]);

  return <DashboardContext.Provider value={{ data, loading, error }}>{children}</DashboardContext.Provider>;
}

export const useDashboardData = () => useContext(DashboardContext);
