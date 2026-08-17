"use client";

import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Clock, Location, People, Routing } from "iconsax-react";
import { functions } from "@/lib/firebase";
import { useAccess } from "@/lib/use-access";

type Stamp = { _seconds?: number; seconds?: number } | string | number | null;
type LocationValue = { latitude: number; longitude: number; accuracy?: number | null };
type Current = { user_id: string; employee_name: string; status: string; last_action_at?: Stamp; last_location?: LocationValue; field_client?: string; field_reason?: string };
type Session = { id: string; user_id: string; employee_name: string; date_key: string; worked_seconds?: number; started_at?: Stamp; ended_at?: Stamp };
type Event = { id: string; user_id: string; employee_name: string; type: string; occurred_at?: Stamp; location?: LocationValue; reason?: string; client?: string };
type Day = { enabled: boolean; start: string; end: string };
type Payload = { current: Current[]; sessions: Session[]; events: Event[]; settings: { timezone: string; days: Record<string, Day> } };

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

export default function AttendancePage() {
  const router = useRouter();
  const { role, loading: accessLoading } = useAccess();
  const [data, setData] = useState<Payload | null>(null);
  const [schedule, setSchedule] = useState<Record<string, Day>>(defaults);
  const [selected, setSelected] = useState<Current | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const result = await httpsCallable<Record<string, number>, Payload>(functions, "attendanceDashboard")({ days: 31 });
      setData(result.data); setSchedule(result.data.settings?.days ?? defaults);
      setSelected((old) => result.data.current.find((x) => x.user_id === old?.user_id) ?? result.data.current[0] ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : "Attendance data could not be loaded."); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (!accessLoading && role !== "owner") router.replace("/dashboard"); }, [accessLoading, role, router]);
  useEffect(() => { if (!accessLoading && role === "owner") void load(); }, [accessLoading, role]);

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

  const save = async () => {
    setSaving(true); setError(null);
    try { await httpsCallable(functions, "updateAttendanceSettings")({ days: schedule }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Schedule could not be saved."); }
    finally { setSaving(false); }
  };
  const loc = selected?.last_location;
  const mapUrl = loc ? `https://www.openstreetmap.org/export/embed.html?bbox=${loc.longitude - .012}%2C${loc.latitude - .008}%2C${loc.longitude + .012}%2C${loc.latitude + .008}&layer=mapnik&marker=${loc.latitude}%2C${loc.longitude}` : "";

  if (accessLoading || role !== "owner") return <main className="min-h-screen grid place-items-center"><div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin" /></main>;
  return (
    <main className="p-8 space-y-6">
      <div className="flex items-start justify-between"><div><h1 className="text-3xl font-bold tracking-tight">Attendance & field work</h1><p className="text-gray-400 mt-1">Owner-only monitoring · all times use East Africa Time.</p></div><button onClick={load} className="rounded-full bg-black text-white px-5 py-2.5 text-sm">Refresh</button></div>
      {error && <div className="rounded-2xl bg-red-50 text-red-700 px-5 py-4 text-sm">{error}</div>}
      <div className="grid grid-cols-3 gap-4">
        {[{ label: "Working now", value: stats.working, icon: People }, { label: "On field work", value: stats.field, icon: Routing }, { label: "Hours · 31 days", value: stats.hours.toFixed(1), icon: Clock }].map((x) => <div key={x.label} className="bg-white rounded-2xl p-5 shadow-sm"><x.icon size={21} /><p className="text-3xl font-bold mt-4">{loading ? "—" : x.value}</p><p className="text-xs text-gray-400 mt-1">{x.label}</p></div>)}
      </div>
      <div className="grid grid-cols-[1.1fr_.9fr] gap-6">
        <section className="bg-white rounded-3xl p-6 shadow-sm"><h2 className="font-bold text-lg mb-1">Working hours & check-ins</h2><p className="text-xs text-gray-400 mb-5">Bars show total hours; the line shows average check-in time in EAT.</p><div className="h-72"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chart}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee"/><XAxis dataKey="date" fontSize={11}/><YAxis yAxisId="hours" fontSize={11}/><YAxis yAxisId="time" orientation="right" domain={[6, 12]} fontSize={11} tickFormatter={(v) => `${Math.floor(v)}:00`}/><Tooltip formatter={(value, name) => name === "checkIn" ? [`${Math.floor(Number(value))}:${String(Math.round((Number(value) % 1) * 60)).padStart(2, "0")}`, "Average check-in"] : [`${value} h`, "Hours worked"]}/><Bar yAxisId="hours" dataKey="hours" fill="#1D2825" radius={[7,7,0,0]}/><Line yAxisId="time" dataKey="checkIn" stroke="#f59e0b" strokeWidth={3} connectNulls dot={{ r: 3 }}/></ComposedChart></ResponsiveContainer></div></section>
        <section className="bg-white rounded-3xl p-6 shadow-sm"><h2 className="font-bold text-lg mb-5">Latest employee location</h2>{loc ? <><iframe title="Employee attendance location" className="w-full h-60 rounded-2xl border-0" src={mapUrl}/><p className="text-sm font-medium mt-3">{selected?.employee_name}</p><p className="text-xs text-gray-400">Captured {time(selected?.last_action_at)}{loc.accuracy ? ` · ±${Math.round(loc.accuracy)} m` : ""}</p></> : <div className="h-60 rounded-2xl bg-gray-50 grid place-items-center text-sm text-gray-400"><Location size={24}/>No location recorded yet</div>}</section>
      </div>
      <div className="grid grid-cols-[1fr_1fr] gap-6">
        <section className="bg-white rounded-3xl p-6 shadow-sm"><h2 className="font-bold text-lg mb-4">Live employee status</h2><div className="space-y-2">{data?.current.map((row) => <button key={row.user_id} onClick={() => setSelected(row)} className={`w-full text-left flex justify-between items-center rounded-2xl px-4 py-3 ${selected?.user_id === row.user_id ? "bg-black text-white" : "bg-gray-50"}`}><span><span className="block text-sm font-medium">{row.employee_name}</span><span className="block text-[11px] opacity-60">{time(row.last_action_at)}</span></span><span className="text-xs font-semibold">{statusLabel(row.status)}</span></button>)}{!data?.current.length && <p className="text-sm text-gray-400">No employee has used attendance yet.</p>}</div></section>
        <section className="bg-white rounded-3xl p-6 shadow-sm"><h2 className="font-bold text-lg mb-4">Recent activity</h2><div className="max-h-96 overflow-auto space-y-3">{data?.events.slice(0, 30).map((event) => <div key={event.id} className="border-b border-gray-100 pb-3"><div className="flex justify-between"><p className="text-sm font-medium">{event.employee_name}</p><p className="text-xs text-gray-400">{time(event.occurred_at)}</p></div><p className="text-xs text-gray-500 mt-1">{statusLabel(event.type)}{event.client ? ` · ${event.client}` : ""}{event.reason ? ` · ${event.reason}` : ""}</p></div>)}</div></section>
      </div>
      <section className="bg-white rounded-3xl p-6 shadow-sm"><div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-lg">Working schedule</h2><p className="text-xs text-gray-400">Defaults: Mon–Fri 08:00–17:00, Sat 09:00–15:00 EAT.</p></div><button disabled={saving} onClick={save} className="rounded-full bg-black disabled:opacity-50 text-white px-5 py-2.5 text-sm">{saving ? "Saving…" : "Save schedule"}</button></div><div className="grid grid-cols-2 gap-3">{Object.entries(labels).map(([key, label]) => { const day = schedule[key] ?? defaults[key]; return <div key={key} className="flex items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3"><input type="checkbox" checked={day.enabled} onChange={(e) => setSchedule({ ...schedule, [key]: { ...day, enabled: e.target.checked } })}/><span className="w-24 text-sm font-medium">{label}</span><input type="time" value={day.start} disabled={!day.enabled} onChange={(e) => setSchedule({ ...schedule, [key]: { ...day, start: e.target.value } })} className="rounded-lg border px-2 py-1 text-sm"/><span className="text-gray-400">to</span><input type="time" value={day.end} disabled={!day.enabled} onChange={(e) => setSchedule({ ...schedule, [key]: { ...day, end: e.target.value } })} className="rounded-lg border px-2 py-1 text-sm"/></div>; })}</div></section>
    </main>
  );
}
