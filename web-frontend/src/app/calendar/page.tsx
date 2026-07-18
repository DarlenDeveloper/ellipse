"use client";

import { useState } from "react";
import { ArrowLeft2, ArrowRight2, Add } from "iconsax-react";
import { cn } from "@/lib/utils";

type CalendarEvent = {
  id: string;
  title: string;
  time: string;
  color: string;
  day: number;
};

const events: CalendarEvent[] = [
  { id: "1", title: "Sprint Planning", time: "9:00 AM", color: "bg-blue-500", day: 14 },
  { id: "2", title: "WhatsApp API Setup", time: "11:00 AM", color: "bg-green-500", day: 14 },
  { id: "3", title: "Agent Review", time: "2:00 PM", color: "bg-purple-500", day: 15 },
  { id: "4", title: "Client Demo", time: "10:00 AM", color: "bg-amber-500", day: 16 },
  { id: "5", title: "Design Sync", time: "3:00 PM", color: "bg-pink-500", day: 17 },
  { id: "6", title: "Analytics Review", time: "11:00 AM", color: "bg-indigo-500", day: 18 },
  { id: "7", title: "Team Standup", time: "9:30 AM", color: "bg-emerald-500", day: 15 },
  { id: "8", title: "Zoho Integration", time: "4:00 PM", color: "bg-orange-500", day: 19 },
];

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDaysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(month: number, year: number) {
  return new Date(year, month, 1).getDay();
}

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(6); // July (0-indexed)
  const [currentYear] = useState(2026);

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
  const today = 14; // Mock today

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const prev = () => setCurrentMonth((m) => (m === 0 ? 11 : m - 1));
  const next = () => setCurrentMonth((m) => (m === 11 ? 0 : m + 1));

  return (
    <main className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-gray-400 mt-1">Schedule and track tasks, meetings, and deadlines.</p>
        </div>
        <button className="flex items-center gap-2 bg-black text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-gray-800">
          <Add size={18} variant="Linear" color="#ffffff" />
          New Event
        </button>
      </div>

      <div className="grid grid-cols-[1fr_320px] gap-6">
        {/* Calendar grid */}
        <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">
              {monthNames[currentMonth]} {currentYear}
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={prev} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100">
                <ArrowLeft2 size={16} variant="Linear" />
              </button>
              <button onClick={next} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100">
                <ArrowRight2 size={16} variant="Linear" />
              </button>
            </div>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {days.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">
                {d}
              </div>
            ))}
          </div>

          {/* Date cells */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="h-20 rounded-xl" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayEvents = events.filter((e) => e.day === day);
              const isToday = day === today;
              return (
                <div
                  key={day}
                  className={cn(
                    "h-20 rounded-xl p-1.5 border transition-colors cursor-pointer hover:bg-gray-50",
                    isToday ? "border-black bg-gray-50" : "border-transparent"
                  )}
                >
                  <span
                    className={cn(
                      "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-0.5",
                      isToday ? "bg-black text-white" : "text-gray-700"
                    )}
                  >
                    {day}
                  </span>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map((evt) => (
                      <div
                        key={evt.id}
                        className={cn("h-1.5 rounded-full", evt.color)}
                      />
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="text-[9px] text-gray-400">+{dayEvents.length - 2}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming events sidebar */}
        <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <h3 className="text-lg font-bold mb-5">Upcoming</h3>
          <div className="space-y-4">
            {events
              .filter((e) => e.day >= today)
              .sort((a, b) => a.day - b.day)
              .slice(0, 6)
              .map((evt) => (
                <div key={evt.id} className="flex items-center gap-3">
                  <div className={cn("w-2 h-8 rounded-full", evt.color)} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{evt.title}</p>
                    <p className="text-xs text-gray-400">
                      Jul {evt.day} • {evt.time}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </main>
  );
}
