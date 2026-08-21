"use client";

import { useEffect, useRef, useState } from "react";
import { CloseCircle, MagicStar, Notification, ReceiptItem, TrendUp } from "iconsax-react";
import { useAuth } from "@/lib/auth-context";

// Update this ID and the entries whenever a new customer-facing release ships.
// Each release runs a three-day, twice-daily announcement campaign.
const RELEASE = {
  id: "2026-08-21.1",
  label: "August 2026",
  title: "A smarter, more connected Ellipse",
  summary: "A quick look at the latest improvements across your workspace.",
  highlights: [
    {
      icon: Notification,
      color: "#2563eb",
      title: "Timely browser notifications",
      description: "Enable alerts after sign-in and stay updated on messages, approvals and workspace activity.",
    },
    {
      icon: ReceiptItem,
      color: "#7c3aed",
      title: "Richer product invoices",
      description: "Ivy now adds verified Mercury Store specifications such as processor, RAM and storage to invoices.",
    },
    {
      icon: TrendUp,
      color: "#059669",
      title: "Restored reports and navigation",
      description: "Daily reporting is restored with improved report formatting, history and user-controlled pagination.",
    },
  ],
} as const;

export function WhatsNewPopup() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const source = useRef<"scheduled" | "manual">("scheduled");
  const activeSlot = useRef("");

  useEffect(() => {
    if (!user) return;
    const prefix = `ellipse_whats_new:${user.uid}:${RELEASE.id}`;
    const startKey = `${prefix}:started`;
    const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const dayNumber = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
    if (!localStorage.getItem(startKey)) localStorage.setItem(startKey, localDate(new Date()));

    const checkWindow = () => {
      const now = new Date();
      const started = new Date(`${localStorage.getItem(startKey)}T00:00:00`);
      const campaignDay = dayNumber(now) - dayNumber(started);
      if (campaignDay < 0 || campaignDay >= 3) return;
      const period = now.getHours() < 12 ? "morning" : "lunch";
      const slot = `${prefix}:${localDate(now)}:${period}`;
      if (localStorage.getItem(slot)) return;
      source.current = "scheduled";
      activeSlot.current = slot;
      setOpen(true);
    };

    const timer = window.setTimeout(checkWindow, 500);
    // Covers a user who keeps Ellipse open across the lunch boundary.
    const interval = window.setInterval(checkWindow, 60_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [user]);

  const dismiss = () => {
    if (source.current === "scheduled" && activeSlot.current) localStorage.setItem(activeSlot.current, "seen");
    setOpen(false);
  };

  return (
    <>
      <button type="button" onClick={() => { source.current = "manual"; setOpen(true); }} className="fixed right-20 top-6 z-40 flex h-11 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50" aria-label="See what's new">
        <MagicStar size={17} color="#111827" variant="Bold" />
        <span>What&apos;s new</span>
      </button>

      {open && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/30 p-5 backdrop-blur-[3px]">
      <div role="dialog" aria-modal="true" aria-labelledby="whats-new-title" className="relative w-full max-w-[540px] overflow-hidden rounded-[32px] border border-white/70 bg-white shadow-[0_35px_110px_rgba(15,23,42,0.28)]">
        <div className="relative overflow-hidden bg-[#0b0b0d] px-8 pb-8 pt-7 text-white">
          <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-blue-500/30 blur-3xl" />
          <div className="absolute -bottom-20 left-24 h-40 w-40 rounded-full bg-violet-500/20 blur-3xl" />
          <button type="button" onClick={dismiss} className="absolute right-5 top-5 z-10 rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="Close what's new"><CloseCircle size={23} /></button>
          <div className="relative">
            <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">What&apos;s new · {RELEASE.label}</span>
            <h2 id="whats-new-title" className="mt-5 max-w-md text-[28px] font-bold leading-tight tracking-tight">{RELEASE.title}</h2>
            <p className="mt-2 text-sm leading-6 text-white/60">{RELEASE.summary}</p>
          </div>
        </div>

        <div className="space-y-1 px-7 py-6">
          {RELEASE.highlights.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex gap-4 rounded-2xl p-3 transition hover:bg-gray-50">
                <Icon className="mt-1 shrink-0" size={24} color={item.color} variant="Bold" />
                <div className="pt-0.5"><h3 className="text-sm font-bold text-gray-950">{item.title}</h3><p className="mt-1 text-xs leading-5 text-gray-500">{item.description}</p></div>
              </div>
            );
          })}
          <button type="button" onClick={dismiss} className="mt-4 w-full rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800">Explore the updates</button>
        </div>
      </div>
    </div>}
    </>
  );
}
