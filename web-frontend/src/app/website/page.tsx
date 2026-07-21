"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Eye, Profile2User, ArrowSwapHorizontal, Global, Location } from "iconsax-react";
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
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayLabel(k: string) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function relTime(d?: Date) {
  if (!d) return "";
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Horizontal bar-list (Nolito-style).
function BarList({ rows, empty }: { rows: [string, number][]; empty: string }) {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  if (rows.length === 0) return <p className="text-sm text-gray-400">{empty}</p>;
  return (
    <div className="space-y-2">
      {rows.map(([label, count]) => (
        <div key={label} className="relative rounded-lg overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-purple-50 rounded-lg"
            style={{ width: `${(count / max) * 100}%` }}
          />
          <div className="relative flex items-center justify-between px-3 py-2 text-sm">
            <span className="truncate text-gray-700">{label}</span>
            <span className="font-semibold shrink-0 ml-3">{count}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Dark rounded value pill shown on hover (Nolito/reference style).
function PillTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 text-white text-xs font-semibold rounded-lg px-3 py-1.5 shadow-lg">
      {payload[0].value}
    </div>
  );
}

const RANGES = [
  { label: "7D", days: 7 },
  { label: "14D", days: 14 },
  { label: "30D", days: 30 },
] as const;

export default function WebsitePage() {
  const { enterpriseId } = useEnterpriseId();
  const [events, setEvents] = useState<WebEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [rangeDays, setRangeDays] = useState(14);

  useEffect(() => {
    if (!enterpriseId) return;
    const q = query(collection(db, "analytics_events"), where("workspace_id", "==", enterpriseId));
    return onSnapshot(q, (snap) => {
      setEvents(snap.docs.map((d) => d.data() as WebEvent).filter((e) => e.source === "web"));
      setLoading(false);
    });
  }, [enterpriseId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

  const s = useMemo(() => {
    const pv = events.filter((e) => (e.payload?.type ?? "pageview") === "pageview");
    const totalViews = pv.length;
    const visitors = new Set(pv.map((e) => e.payload?.visitor_id).filter(Boolean)).size;

    const newVids = new Set(events.filter((e) => e.payload?.is_new).map((e) => e.payload?.visitor_id).filter(Boolean));
    const newVisitors = newVids.size;
    const returningVisitors = Math.max(0, visitors - newVisitors);

    const perSession: Record<string, number> = {};
    for (const e of pv) {
      const sid = e.payload?.session_id || e.payload?.visitor_id || "";
      if (sid) perSession[sid] = (perSession[sid] ?? 0) + 1;
    }
    const sessions = Object.keys(perSession).length;
    const bounced = Object.values(perSession).filter((c) => c === 1).length;
    const bounceRate = sessions ? Math.round((bounced / sessions) * 100) : 0;

    const fiveMinAgo = now - 5 * 60 * 1000;
    const online = new Set(
      events.filter((e) => (e.timestamp?.toDate?.().getTime() ?? 0) >= fiveMinAgo).map((e) => e.payload?.visitor_id).filter(Boolean)
    ).size;

    // Daily series (last 14 days).
    const viewsByDay: Record<string, number> = {};
    const visByDay: Record<string, Set<string>> = {};
    for (const e of pv) {
      const d = e.timestamp?.toDate?.();
      if (!d) continue;
      const k = dayKey(d);
      viewsByDay[k] = (viewsByDay[k] ?? 0) + 1;
      (visByDay[k] ??= new Set()).add(e.payload?.visitor_id ?? "");
    }
    // Zero-fill every day in the range so the chart has a proper baseline/body
    // (not a single floating point on day one).
    const series: { day: string; views: number; visitors: number }[] = [];
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const k = dayKey(d);
      series.push({
        day: dayLabel(k),
        views: viewsByDay[k] ?? 0,
        visitors: visByDay[k]?.size ?? 0,
      });
    }

    const tally = (key: "country" | "city") => {
      const m: Record<string, number> = {};
      for (const e of pv) {
        const v = e.payload?.[key];
        if (v) m[v] = (m[v] ?? 0) + 1;
      }
      return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);
    };

    const byPage: Record<string, number> = {};
    for (const e of pv) {
      const p = pathOf(e.payload?.url);
      byPage[p] = (byPage[p] ?? 0) + 1;
    }
    const topPages = Object.entries(byPage).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const recent = [...pv]
      .sort((a, b) => (b.timestamp?.toDate?.().getTime() ?? 0) - (a.timestamp?.toDate?.().getTime() ?? 0))
      .slice(0, 5);

    return {
      totalViews, visitors, newVisitors, returningVisitors, bounceRate, online,
      series, topCountries: tally("country"), topCities: tally("city"), topPages, recent,
    };
  }, [events, now, rangeDays]);

  const kpi = (icon: React.ReactNode, value: string | number, label: string) => (
    <div className="bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center mb-4">{icon}</div>
      <p className="text-2xl font-bold">{loading ? "—" : value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  );

  return (
    <main className="p-8 space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Website Analytics</h1>
        <p className="text-gray-400 mt-1">Live visitor stats from your connected website.</p>
      </div>

      {/* Row 1: KPIs + accent hero */}
      <div className="grid grid-cols-[1fr_1fr_1fr_340px] gap-5">
        {kpi(<Eye size={20} variant="Bold" color="#1a1a1a" />, s.totalViews.toLocaleString(), "Page views")}
        {kpi(<Profile2User size={20} variant="Bold" color="#1a1a1a" />, s.visitors.toLocaleString(), "Unique visitors")}
        {kpi(<ArrowSwapHorizontal size={20} variant="Bold" color="#1a1a1a" />, `${s.bounceRate}%`, "Bounce rate")}

        {/* Accent hero — real-time */}
        <div className="bg-black text-white rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300">Real-time</span>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
          </div>
          <p className="text-4xl font-bold mt-2">{loading ? "—" : s.online}</p>
          <p className="text-xs text-gray-400">visitors online now</p>
          <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5 overflow-hidden">
            {s.recent.length === 0 ? (
              <p className="text-xs text-gray-500">No recent activity.</p>
            ) : (
              s.recent.map((e, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300 truncate">{pathOf(e.payload?.url)}</span>
                  <span className="text-gray-500 shrink-0 ml-2">{relTime(e.timestamp?.toDate?.())}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Row 2: trend charts (smooth area, dashed grid, hover pill) */}
      <div className="grid grid-cols-2 gap-6">
        {[
          { key: "views", title: "Page views", color: "#34d399", fill: "pvGrad" },
          { key: "visitors", title: "Unique visitors", color: "#a78bfa", fill: "uvGrad" },
        ].map((cfg) => (
          <div key={cfg.key} className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold">{cfg.title}</h3>
              <div className="flex items-center gap-1">
                {RANGES.map((r) => (
                  <button
                    key={r.label}
                    onClick={() => setRangeDays(r.days)}
                    className={`text-[11px] font-medium rounded-full px-2.5 py-1 ${
                      rangeDays === r.days ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            {s.series.length === 0 ? (
              <p className="text-sm text-gray-400 py-12 text-center">No data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={s.series} margin={{ left: -18, right: 6, top: 6, bottom: 0 }}>
                  <defs>
                    <linearGradient id={cfg.fill} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={cfg.color} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={cfg.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="6 6" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#9ca3af" }} minTickGap={20} />
                  <YAxis axisLine={false} tickLine={false} fontSize={11} tick={{ fill: "#9ca3af" }} allowDecimals={false} width={32} />
                  <Tooltip content={<PillTooltip />} cursor={{ stroke: "#d1d5db", strokeWidth: 1 }} />
                  <Area
                    type="monotone"
                    dataKey={cfg.key}
                    stroke={cfg.color}
                    strokeWidth={3}
                    fill={`url(#${cfg.fill})`}
                    activeDot={{ r: 5, fill: "#ffffff", stroke: cfg.color, strokeWidth: 3 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        ))}
      </div>

      {/* Row 3: top pages (wide) + new/returning */}
      <div className="grid grid-cols-[1.5fr_1fr] gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <h3 className="text-sm font-bold mb-4">Top pages</h3>
          <BarList rows={s.topPages} empty="No visits yet." />
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <h3 className="text-sm font-bold mb-4">New vs Returning</h3>
          {s.visitors === 0 ? (
            <p className="text-sm text-gray-400">No visitors yet.</p>
          ) : (
            <>
              <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                <div className="bg-black" style={{ width: `${(s.newVisitors / s.visitors) * 100}%` }} />
                <div className="bg-purple-400" style={{ width: `${(s.returningVisitors / s.visitors) * 100}%` }} />
              </div>
              <div className="flex items-center gap-6 mt-4 text-sm">
                <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-black" />New {s.newVisitors}</span>
                <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-purple-400" />Returning {s.returningVisitors}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Row 4: geo */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
            <Global size={16} variant="Bold" color="#1a1a1a" /> Top countries
          </h3>
          <BarList rows={s.topCountries} empty="No geo data yet." />
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
            <Location size={16} variant="Bold" color="#1a1a1a" /> Top cities
          </h3>
          <BarList rows={s.topCities} empty="No geo data yet." />
        </div>
      </div>
    </main>
  );
}
