"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Clock, Location, LocationSlash, People, Routing, SearchNormal1, ArrowLeft2, Moon, User } from "iconsax-react";
import { functions } from "@/lib/firebase";
import { useAccess } from "@/lib/use-access";
import AttendanceMap, { type TeamPin, type RoutePoint, type DwellMarker } from "@/components/attendance/AttendanceMap";

type Stamp = { _seconds?: number; seconds?: number } | string | number | null;
type LocationValue = { latitude: number; longitude: number; accuracy?: number | null };
type Current = { user_id: string; employee_name: string; status: string; last_action_at?: Stamp; last_location?: LocationValue; field_client?: string; field_reason?: string };
type Session = { id: string; user_id: string; employee_name: string; date_key: string; worked_seconds?: number; started_at?: Stamp; ended_at?: Stamp };
type Event = { id: string; user_id: string; employee_name: string; type: string; occurred_at?: Stamp; location?: LocationValue; reason?: string; client?: string };
type Day = { enabled: boolean; start: string; end: string };
type Payload = { current: Current[]; sessions: Session[]; events: Event[]; settings: { timezone: string; days: Record<string, Day> } };

type TrackPoint = { latitude: number; longitude: number; ts: number; accuracy?: number | null };
type Track = { session_id: string; points: TrackPoint[]; dwell: { latitude: number; longitude: number; start: number; end: number; seconds: number }[] };
type Detail = { employee: { uid: string; name: string }; sessions: Session[]; tracks: Track[] };

const labels: Record<string, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const defaults: Record<string, Day> = {
  mon: { enabled: true, start: "08:00", end: "17:00" }, tue: { enabled: true, start: "08:00", end: "17:00" }, wed: { enabled: true, start: "08:00", end: "17:00" }, thu: { enabled: true, start: "08:00", end: "17:00" }, fri: { enabled: true, start: "08:00", end: "17:00" }, sat: { enabled: true, start: "09:00", end: "15:00" }, sun: { enabled: false, start: "09:00", end: "15:00" },
};

function dateOf(value?: Stamp) {
  if (!value) return null;
  if (typeof value === "number" || typeof value === "string") return new Date(value);
  return new Date((value._seconds ?? value.seconds ?? 0) * 1000);
}
function time(value?: Stamp) { const d = dateOf(value); return d ? d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—"; }
function statusLabel(status: string) { return status.split("_").map((x) => x[0]?.toUpperCase() + x.slice(1)).join(" "); }
function durationLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}
function whenShort(ms: number) { return new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }

export default function AttendancePage() {
  const router = useRouter();
  const { role, loading: accessLoading } = useAccess();
  const [data, setData] = useState<Payload | null>(null);
  const [schedule, setSchedule] = useState<Record<string, Day>>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live team map search + fly-to.
  const [query, setQuery] = useState("");
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; z?: number } | null>(null);

  // Route viewer.
  const [routeUid, setRouteUid] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeRoute, setActiveRoute] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await httpsCallable<Record<string, number>, Payload>(functions, "attendanceDashboard")({ days: 31 });
      setData(result.data); setSchedule(result.data.settings?.days ?? defaults);
    } catch (e) { setError(e instanceof Error ? e.message : "Attendance data could not be loaded."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (!accessLoading && role !== "owner") router.replace("/dashboard"); }, [accessLoading, role, router]);
  useEffect(() => { if (!accessLoading && role === "owner") void load(); }, [accessLoading, role, load]);

  const loadDetail = useCallback(async (uid: string) => {
    setRouteUid(uid); setDetail(null); setDetailLoading(true); setActiveRoute(0);
    try {
      const result = await httpsCallable<{ employeeUid: string; days: number }, Detail>(functions, "attendanceEmployeeDetail")({ employeeUid: uid, days: 14 });
      setDetail(result.data);
    } catch (e) { setError(e instanceof Error ? e.message : "Employee routes could not be loaded."); }
    finally { setDetailLoading(false); }
  }, []);

  const chart = useMemo(() => {
    const rows: Record<string, { date: string; hours: number; checkInTotal: number; checkIns: number }> = {};
    for (const s of data?.sessions ?? []) { const row = rows[s.date_key] ??= { date: s.date_key.slice(5), hours: 0, checkInTotal: 0, checkIns: 0 }; row.hours += (s.worked_seconds ?? 0) / 3600; }
    for (const event of data?.events ?? []) {
      if (event.type !== "clock_in") continue;
      const d = dateOf(event.occurred_at); if (!d) continue;
      const key = new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
      const eat = new Date(d.getTime() + 3 * 3600_000);
      const row = rows[key] ??= { date: key.slice(5), hours: 0, checkInTotal: 0, checkIns: 0 };
      row.checkInTotal += eat.getUTCHours() + eat.getUTCMinutes() / 60; row.checkIns++;
    }
    return Object.values(rows).sort((a, b) => a.date.localeCompare(b.date)).slice(-14).map((r) => ({ ...r, hours: Number(r.hours.toFixed(1)), checkIn: r.checkIns ? Number((r.checkInTotal / r.checkIns).toFixed(2)) : null }));
  }, [data]);

  const stats = useMemo(() => ({
    working: data?.current.filter((x) => x.status === "working").length ?? 0,
    field: data?.current.filter((x) => x.status === "field_work").length ?? 0,
    hours: (data?.sessions.reduce((n, s) => n + (s.worked_seconds ?? 0), 0) ?? 0) / 3600,
  }), [data]);

  const checkInDomain = useMemo(() => {
    const values = chart.map((r) => r.checkIn).filter((v): v is number => v !== null);
    if (!values.length) return [6, 12];
    return [Math.max(0, Math.floor(Math.min(...values)) - 1), Math.min(24, Math.ceil(Math.max(...values)) + 1)];
  }, [chart]);

  // Map pins: on-duty employees with a location. field_work = live (purple),
  // working = last known (blue).
  const pins = useMemo<TeamPin[]>(() => {
    const out: TeamPin[] = [];
    for (const c of data?.current ?? []) {
      if (c.status !== "working" && c.status !== "field_work") continue;
      const l = c.last_location;
      if (!l) continue;
      out.push({ id: c.user_id, name: c.employee_name, lat: l.latitude, lng: l.longitude, live: c.status === "field_work" });
    }
    return out;
  }, [data]);

  // Search across the full roster; "location off" for on-duty w/o a point.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as Current[];
    return (data?.current ?? []).filter((c) => c.employee_name.toLowerCase().includes(q));
  }, [query, data]);

  const routes = useMemo(() => {
    return (detail?.tracks ?? [])
      .filter((t) => (t.points?.length ?? 0) >= 2)
      .map((t) => {
        const points: RoutePoint[] = t.points.map((p) => ({ lat: p.latitude, lng: p.longitude }));
        const dwell: DwellMarker[] = (t.dwell ?? []).map((d) => ({ lat: d.latitude, lng: d.longitude, label: durationLabel(d.seconds) }));
        const startedMs = t.points[0]?.ts ?? 0;
        return { sessionId: t.session_id, points, dwell, startedMs };
      })
      .sort((a, b) => b.startedMs - a.startedMs);
  }, [detail]);

  const save = async () => {
    setSaving(true); setError(null);
    try { await httpsCallable(functions, "updateAttendanceSettings")({ days: schedule }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Schedule could not be saved."); }
    finally { setSaving(false); }
  };

  if (accessLoading || role !== "owner") return <main className="min-h-screen grid place-items-center"><div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin" /></main>;

  const current = routes[activeRoute];

  return (
    <main className="p-8 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Attendance &amp; field work</h1>
          <p className="text-gray-400 mt-1">Owner-only monitoring · all times use East Africa Time.</p>
        </div>
        <button onClick={load} className="rounded-full bg-black text-white px-5 py-2.5 text-sm hover:bg-gray-800 transition">Refresh</button>
      </div>
      {error && <div className="rounded-2xl bg-red-50 text-red-700 px-5 py-4 text-sm">{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Working now", value: stats.working, icon: People, tint: "bg-blue-50 text-blue-600" },
          { label: "On field work", value: stats.field, icon: Routing, tint: "bg-violet-50 text-violet-600" },
          { label: "Hours · 31 days", value: stats.hours.toFixed(1), icon: Clock, tint: "bg-emerald-50 text-emerald-600" },
        ].map((x) => (
          <div key={x.label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className={`w-10 h-10 rounded-xl grid place-items-center ${x.tint}`}><x.icon size={20} /></div>
            <p className="text-3xl font-bold mt-4">{loading ? "—" : x.value}</p>
            <p className="text-xs text-gray-400 mt-1">{x.label}</p>
          </div>
        ))}
      </div>

      {/* Live team map */}
      <section className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="font-bold text-lg">Live team map</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500" /> Field (live)</span>
              <span className="inline-flex items-center gap-1 ml-3"><span className="w-2 h-2 rounded-full bg-blue-500" /> Working (last known)</span>
            </p>
          </div>
          <div className="relative w-72">
            <SearchNormal1 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search team member"
              className="w-full rounded-full bg-gray-50 border border-gray-200 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/10"
            />
            {query && (
              <div className="absolute z-10 mt-2 w-full bg-white rounded-2xl shadow-lg border border-gray-100 max-h-72 overflow-auto">
                {results.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">No match for “{query}”.</p>}
                {results.map((c) => {
                  const l = c.last_location;
                  const onDuty = c.status === "working" || c.status === "field_work";
                  const locatable = !!l && onDuty;
                  const sub = c.status === "field_work"
                    ? (locatable ? "On field work · live" : "On field · location off")
                    : c.status === "working"
                      ? (locatable ? "Working · last known" : "Working · location off")
                      : "Off duty";
                  return (
                    <button
                      key={c.user_id}
                      onClick={() => { if (l) setFlyTo({ lat: l.latitude, lng: l.longitude, z: 16 }); setQuery(""); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left"
                    >
                      <span className={`w-8 h-8 rounded-full grid place-items-center ${c.status === "field_work" ? "bg-violet-50 text-violet-600" : locatable ? "bg-blue-50 text-blue-600" : c.status === "working" ? "bg-amber-50 text-amber-600" : "bg-gray-100 text-gray-500"}`}>
                        {c.status === "clocked_out" ? <Moon size={15} /> : locatable ? (c.status === "field_work" ? <Routing size={15} /> : <User size={15} />) : <LocationSlash size={15} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium truncate">{c.employee_name}</span>
                        <span className="block text-[11px] text-gray-400">{sub}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="h-[420px] relative">
          {pins.length === 0 ? (
            <div className="h-full grid place-items-center bg-gray-50 text-sm text-gray-400 gap-2">
              <Location size={26} />
              No live locations right now. Employees appear here while working or on field work with location on.
            </div>
          ) : (
            <AttendanceMap mode="team" pins={pins} flyTo={flyTo} />
          )}
        </div>
      </section>

      {/* Chart + Live status */}
      <div className="grid grid-cols-[1.3fr_.7fr] gap-6">
        <section className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-bold text-lg mb-1">Working hours &amp; check-ins</h2>
          <p className="text-xs text-gray-400 mb-5">Bars show total hours; the line shows average check-in time in EAT.</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="date" fontSize={11} /><YAxis yAxisId="hours" fontSize={11} />
                <YAxis yAxisId="time" orientation="right" domain={checkInDomain} fontSize={11} tickFormatter={(v) => `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, "0")}`} />
                <Tooltip formatter={(value, name) => name === "checkIn" ? [`${Math.floor(Number(value))}:${String(Math.round((Number(value) % 1) * 60)).padStart(2, "0")}`, "Average check-in"] : [`${value} h`, "Hours worked"]} />
                <Bar yAxisId="hours" dataKey="hours" fill="#1D2825" radius={[7, 7, 0, 0]} />
                <Line yAxisId="time" dataKey="checkIn" stroke="#f59e0b" strokeWidth={3} connectNulls dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
          <h2 className="font-bold text-lg mb-4">Live status</h2>
          <div className="space-y-2 max-h-64 overflow-auto pr-1">
            {data?.current.map((row) => {
              const dot = row.status === "field_work" ? "bg-violet-500" : row.status === "working" ? "bg-blue-500" : "bg-gray-300";
              return (
                <button key={row.user_id} onClick={() => loadDetail(row.user_id)} className={`w-full text-left flex justify-between items-center rounded-2xl px-4 py-3 border transition ${routeUid === row.user_id ? "border-black bg-gray-50" : "border-transparent bg-gray-50 hover:border-gray-200"}`}>
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full ${dot}`} />
                    <span className="min-w-0"><span className="block text-sm font-medium truncate">{row.employee_name}</span><span className="block text-[11px] text-gray-400">{time(row.last_action_at)}</span></span>
                  </span>
                  <span className="text-[11px] font-semibold text-gray-500 shrink-0">{statusLabel(row.status)}</span>
                </button>
              );
            })}
            {!data?.current.length && <p className="text-sm text-gray-400">No employee has used attendance yet.</p>}
          </div>
        </section>
      </div>

      {/* Field-work route viewer */}
      <section className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 pt-6 pb-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">Field-work routes</h2>
            <p className="text-xs text-gray-400 mt-0.5">{routeUid ? (detail?.employee.name ?? "Loading…") : "Select an employee from Live status to view their recorded routes."}</p>
          </div>
          {routeUid && <button onClick={() => { setRouteUid(null); setDetail(null); }} className="text-xs text-gray-500 flex items-center gap-1 hover:text-black"><ArrowLeft2 size={14} /> Clear</button>}
        </div>
        {!routeUid ? (
          <div className="h-56 grid place-items-center bg-gray-50 text-sm text-gray-400 gap-2"><Routing size={26} /> No employee selected.</div>
        ) : detailLoading ? (
          <div className="h-56 grid place-items-center"><div className="w-6 h-6 border-2 border-gray-300 border-t-black rounded-full animate-spin" /></div>
        ) : routes.length === 0 ? (
          <div className="h-56 grid place-items-center bg-gray-50 text-sm text-gray-400 gap-2"><Location size={26} /> No routes recorded in the last 14 days.</div>
        ) : (
          <div className="grid grid-cols-[240px_1fr]">
            <div className="border-r border-gray-100 max-h-[460px] overflow-auto">
              {routes.map((r, i) => (
                <button key={r.sessionId} onClick={() => setActiveRoute(i)} className={`w-full text-left px-5 py-4 border-b border-gray-50 ${i === activeRoute ? "bg-gray-50" : "hover:bg-gray-50/60"}`}>
                  <p className="text-sm font-semibold">{r.startedMs ? whenShort(r.startedMs) : `Route ${i + 1}`}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{r.points.length} points · {r.dwell.length} stop{r.dwell.length === 1 ? "" : "s"}</p>
                </button>
              ))}
            </div>
            <div className="h-[460px]">
              {current && <AttendanceMap mode="route" route={current.points} dwell={current.dwell} />}
            </div>
          </div>
        )}
      </section>

      {/* Working schedule */}
      <section className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-5">
          <div><h2 className="font-bold text-lg">Working schedule</h2><p className="text-xs text-gray-400">Defaults: Mon–Fri 08:00–17:00, Sat 09:00–15:00 EAT.</p></div>
          <button disabled={saving} onClick={save} className="rounded-full bg-black disabled:opacity-50 text-white px-5 py-2.5 text-sm">{saving ? "Saving…" : "Save schedule"}</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(labels).map(([key, label]) => {
            const day = schedule[key] ?? defaults[key];
            return (
              <div key={key} className="flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3">
                <input type="checkbox" checked={day.enabled} onChange={(e) => setSchedule({ ...schedule, [key]: { ...day, enabled: e.target.checked } })} />
                <span className="w-24 text-sm font-medium">{label}</span>
                <input type="time" value={day.start} disabled={!day.enabled} onChange={(e) => setSchedule({ ...schedule, [key]: { ...day, start: e.target.value } })} className="rounded-lg border px-2 py-1 text-sm" />
                <span className="text-gray-400">to</span>
                <input type="time" value={day.end} disabled={!day.enabled} onChange={(e) => setSchedule({ ...schedule, [key]: { ...day, end: e.target.value } })} className="rounded-lg border px-2 py-1 text-sm" />
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
