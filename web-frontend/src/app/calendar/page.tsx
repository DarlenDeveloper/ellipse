"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft2, ArrowRight2, Add, CloseCircle } from "iconsax-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useEnterpriseId } from "@/lib/use-enterprise";
import { cn } from "@/lib/utils";

type CalendarEvent = {
  id: string;
  title: string;
  description?: string;
  start_at: { toDate: () => Date };
  end_at: { toDate: () => Date };
  task_id?: string | null;
  source_conversation_id?: string | null;
  provider?: string;
};

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function CalendarPage() {
  const { user } = useAuth();
  const { enterpriseId } = useEnterpriseId();
  const now = new Date();
  const [viewDate, setViewDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enterpriseId || !user) return;
    return onSnapshot(
      query(collection(db, "calendar_events"), where("enterprise_id", "==", enterpriseId), where("owner_uid", "==", user.uid)),
      (snap) => setEvents(snap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<CalendarEvent, "id">) })).sort((a, b) => a.start_at.toDate().getTime() - b.start_at.toDate().getTime())),
      () => setError("Calendar events could not be loaded.")
    );
  }, [enterpriseId, user]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const dayEvents = (day: number) => events.filter((event) => {
    const date = event.start_at.toDate();
    return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
  });
  const upcoming = useMemo(() => events.filter((event) => event.start_at.toDate().getTime() >= Date.now()).slice(0, 8), [events]);
  const openCreate = (date?: Date) => { setSelectedDay(date ?? null); setShowCreate(true); };

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div><h1 className="text-3xl font-bold tracking-tight">My Calendar</h1><p className="text-gray-400 mt-1">Meetings and time blocks you explicitly add—not every team task.</p></div>
        <button onClick={() => openCreate()} className="flex items-center gap-2 bg-black text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-gray-800"><Add size={18} color="#fff" /> New Event</button>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">{error}</p>}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">{monthNames[month]} {year}</h2>
            <div className="flex gap-2">
              <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100"><ArrowLeft2 size={16} /></button>
              <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100"><ArrowRight2 size={16} /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">{days.map((day) => <div key={day} className="text-center text-xs font-medium text-gray-400 py-2">{day}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, index) => <div key={`empty-${index}`} className="h-24" />)}
            {Array.from({ length: daysInMonth }).map((_, index) => {
              const day = index + 1;
              const entries = dayEvents(day);
              const isToday = now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
              return (
                <button key={day} onClick={() => openCreate(new Date(year, month, day, 9))} className={cn("h-24 rounded-xl p-2 border text-left hover:bg-gray-50 overflow-hidden", isToday ? "border-black bg-gray-50" : "border-transparent")}>
                  <span className={cn("text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full", isToday ? "bg-black text-white" : "text-gray-700")}>{day}</span>
                  <div className="mt-1 space-y-1">{entries.slice(0, 2).map((event) => <div key={event.id} className="text-[10px] bg-purple-50 text-purple-700 rounded px-1.5 py-1 truncate">{event.start_at.toDate().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} {event.title}</div>)}{entries.length > 2 && <span className="text-[9px] text-gray-400">+{entries.length - 2} more</span>}</div>
                </button>
              );
            })}
          </div>
        </div>
        <aside className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <h3 className="text-lg font-bold mb-5">Upcoming</h3>
          <div className="space-y-4">{upcoming.map((event) => <div key={event.id} className="flex gap-3"><div className="w-1.5 rounded-full bg-purple-500" /><div><p className="text-sm font-semibold">{event.title}</p><p className="text-xs text-gray-400">{event.start_at.toDate().toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>{event.task_id && <p className="text-[10px] text-purple-600 mt-1">Linked task</p>}</div></div>)}{upcoming.length === 0 && <p className="text-sm text-gray-400">Nothing scheduled yet.</p>}</div>
        </aside>
      </div>
      {showCreate && <CreateEventModal initialDate={selectedDay} onClose={() => setShowCreate(false)} onError={setError} />}
    </main>
  );
}

function localInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function CreateEventModal({ initialDate, onClose, onError }: { initialDate: Date | null; onClose: () => void; onError: (value: string | null) => void }) {
  const startDefault = initialDate ?? new Date(Date.now() + 60 * 60_000);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState(localInput(startDefault));
  const [endAt, setEndAt] = useState(localInput(new Date(startDefault.getTime() + 30 * 60_000)));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!title.trim()) return;
    setBusy(true); onError(null);
    try { await httpsCallable(functions, "createCalendarEvent")({ title, description, startAt, endAt, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }); onClose(); }
    catch (e) { onError((e as Error).message || "Event creation failed."); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"><div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-xl"><div className="flex justify-between"><h2 className="text-xl font-bold">New event</h2><button onClick={onClose}><CloseCircle size={24} className="text-gray-400" /></button></div><div className="space-y-4 mt-5"><label className="block text-xs text-gray-500">Title<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" /></label><label className="block text-xs text-gray-500">Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none" /></label><div className="grid grid-cols-2 gap-3"><label className="block text-xs text-gray-500">Starts<input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" /></label><label className="block text-xs text-gray-500">Ends<input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" /></label></div></div><div className="flex justify-end gap-3 mt-6"><button onClick={onClose} className="text-sm px-4 py-2">Cancel</button><button disabled={!title.trim() || busy} onClick={save} className="bg-black text-white text-sm rounded-full px-5 py-2.5 disabled:opacity-40">{busy ? "Saving…" : "Add event"}</button></div></div></div>;
}
