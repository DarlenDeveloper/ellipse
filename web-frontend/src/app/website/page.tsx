"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Profile2User, Global, Location, ArrowSwapHorizontal, Flash } from "iconsax-react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useEnterpriseId } from "@/lib/use-enterprise";

type WebEvent = {
  source?: string;
  payload?: {
    type?: string;
    url?: string;
    referrer?: string;
    visitor_id?: string;
    session_id?: string;
    is_new?: boolean;
    country?: string | null;
    city?: string | null;
  };
  timestamp?: { toDate: () => Date };
};

function pathOf(url?: string): string {
  if (!url) return "/";
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

export default function WebsitePage() {
  const { enterpriseId } = useEnterpriseId();
  const [events, setEvents] = useState<WebEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!enterpriseId) return;
    const q = query(collection(db, "analytics_events"), where("workspace_id", "==", enterpriseId));
    return onSnapshot(q, (snap) => {
      setEvents(snap.docs.map((d) => d.data() as WebEvent).filter((e) => e.source === "web"));
      setLoading(false);
    });
  }, [enterpriseId]);

  // Tick every 20s so the real-time window stays fresh.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

  const stats = useMemo(() => {
    const pageviews = events.filter((e) => (e.payload?.type ?? "pageview") === "pageview");
    const totalViews = pageviews.length;

    const visitorSet = new Set(events.map((e) => e.payload?.visitor_id).filter(Boolean));
    const visitors = visitorSet.size;

    // New vs returning (by visitor id that had an is_new event).
    const newVids = new Set(
      events.filter((e) => e.payload?.is_new).map((e) => e.payload?.visitor_id).filter(Boolean)
    );
    const newVisitors = newVids.size;
    const returningVisitors = Math.max(0, visitors - newVisitors);

    // Bounce rate: sessions with exactly 1 pageview / total sessions.
    const perSession: Record<string, number> = {};
    for (const e of pageviews) {
      const sid = e.payload?.session_id || e.payload?.visitor_id || "";
      if (!sid) continue;
      perSession[sid] = (perSession[sid] ?? 0) + 1;
    }
    const sessions = Object.keys(perSession).length;
    const bounced = Object.values(perSession).filter((c) => c === 1).length;
    const bounceRate = sessions ? Math.round((bounced / sessions) * 100) : 0;

    // Real-time: distinct visitors active in the last 5 minutes.
    const fiveMinAgo = now - 5 * 60 * 1000;
    const liveVids = new Set(
      events
        .filter((e) => (e.timestamp?.toDate?.().getTime() ?? 0) >= fiveMinAgo)
        .map((e) => e.payload?.visitor_id)
        .filter(Boolean)
    );
    const online = liveVids.size;

    const tally = (key: "country" | "city") => {
      const m: Record<string, number> = {};
      for (const e of pageviews) {
        const v = e.payload?.[key];
        if (!v) continue;
        m[v] = (m[v] ?? 0) + 1;
      }
      return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
    };

    const byPage: Record<string, number> = {};
    for (const e of pageviews) {
      const p = pathOf(e.payload?.url);
      byPage[p] = (byPage[p] ?? 0) + 1;
    }
    const topPages = Object.entries(byPage).sort((a, b) => b[1] - a[1]).slice(0, 10);

    return {
      totalViews,
      visitors,
      newVisitors,
      returningVisitors,
      bounceRate,
      online,
      topCountries: tally("country"),
      topCities: tally("city"),
      topPages,
    };
  }, [events, now]);

  const kpi = (icon: React.ReactNode, value: string | number, label: string, accent?: boolean) => (
    <div className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${accent ? "bg-green-50" : "bg-gray-50"}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold">{loading ? "—" : value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  );

  const listCard = (title: string, rows: [string, number][], icon: React.ReactNode, empty: string) => (
    <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <h3 className="text-lg font-bold mb-4">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">{empty}</p>
      ) : (
        <div className="space-y-1">
          {rows.map(([label, count]) => (
            <div key={label} className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-50">
              <span className="flex items-center gap-2 text-sm text-gray-700 truncate">
                {icon}
                {label}
              </span>
              <span className="text-sm font-semibold">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <main className="p-8 max-w-[1100px]">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Website Analytics</h1>
          <p className="text-gray-400 mt-2">Live visitor stats from your connected website.</p>
        </div>
        <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          <span className="text-sm font-semibold">{loading ? "—" : stats.online}</span>
          <span className="text-xs text-gray-400">online now</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {kpi(<Eye size={20} variant="Bold" color="#1a1a1a" />, stats.totalViews.toLocaleString(), "Page views")}
        {kpi(<Profile2User size={20} variant="Bold" color="#1a1a1a" />, stats.visitors.toLocaleString(), "Unique visitors")}
        {kpi(<ArrowSwapHorizontal size={20} variant="Bold" color="#1a1a1a" />, `${stats.bounceRate}%`, "Bounce rate")}
        {kpi(<Flash size={20} variant="Bold" color="#16a34a" />, stats.online, "Online now", true)}
      </div>

      {/* New vs returning */}
      <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)] mb-6">
        <h3 className="text-lg font-bold mb-4">New vs Returning</h3>
        {stats.visitors === 0 ? (
          <p className="text-sm text-gray-400">No visitors yet.</p>
        ) : (
          <>
            <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
              <div className="bg-black" style={{ width: `${(stats.newVisitors / stats.visitors) * 100}%` }} />
              <div className="bg-purple-400" style={{ width: `${(stats.returningVisitors / stats.visitors) * 100}%` }} />
            </div>
            <div className="flex items-center gap-6 mt-3 text-sm">
              <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-black" />New {stats.newVisitors}</span>
              <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-purple-400" />Returning {stats.returningVisitors}</span>
            </div>
          </>
        )}
      </div>

      {/* Geo + pages */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {listCard("Top countries", stats.topCountries, <Global size={14} variant="Linear" color="#9ca3af" />, "No geo data yet.")}
        {listCard("Top cities", stats.topCities, <Location size={14} variant="Linear" color="#9ca3af" />, "No geo data yet.")}
      </div>

      {listCard("Top pages", stats.topPages, <Global size={14} variant="Linear" color="#9ca3af" />, "No visits yet. Connect your website under Integrations.")}
    </main>
  );
}
