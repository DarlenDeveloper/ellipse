"use client";

import { useState, useRef, useEffect } from "react";
import { ShieldTick, Flash, CloseCircle, ArrowDown2 } from "iconsax-react";
import { cn } from "@/lib/utils";
import { useMode, type Mode } from "./ModeContext";

const modeConfig: Record<
  Mode,
  { label: string; icon: typeof ShieldTick; dot: string; desc: string }
> = {
  supervised: {
    label: "Supervised",
    icon: ShieldTick,
    dot: "bg-blue-500",
    desc: "Approve actions before they run",
  },
  unsupervised: {
    label: "Unsupervised",
    icon: Flash,
    dot: "bg-purple-500",
    desc: "Agents act automatically",
  },
  off: {
    label: "Off",
    icon: CloseCircle,
    dot: "bg-gray-400",
    desc: "Data collection only, no AI",
  },
};

const order: Mode[] = ["supervised", "unsupervised", "off"];

export function ModeSwitcher({ collapsed }: { collapsed: boolean }) {
  const { mode, setMode } = useMode();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = modeConfig[mode];
  const CurrentIcon = current.icon;

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        title={collapsed ? `Mode: ${current.label}` : undefined}
        className={cn(
          "w-full flex items-center rounded-full border border-gray-200 hover:bg-gray-50 transition-colors",
          collapsed ? "justify-center w-11 h-11 mx-auto" : "gap-2.5 px-3 py-2.5"
        )}
      >
        <div className="relative shrink-0">
          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
            <CurrentIcon size={14} variant="Bold" color="#374151" />
          </div>
          <span className={cn("absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white", current.dot)} />
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 text-left">
              <p className="text-[10px] text-gray-400 leading-none">Mode</p>
              <p className="text-sm font-semibold leading-tight">{current.label}</p>
            </div>
            <ArrowDown2 size={14} variant="Linear" color="#9ca3af" />
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className={cn(
            "absolute bottom-full mb-2 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50",
            collapsed ? "left-0 w-56" : "left-0 right-0"
          )}
        >
          {order.map((m) => {
            const cfg = modeConfig[m];
            const Icon = cfg.icon;
            const active = m === mode;
            return (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors",
                  active ? "bg-gray-100" : "hover:bg-gray-50"
                )}
              >
                <div className="relative shrink-0">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                    <Icon size={16} variant="Bold" color="#374151" />
                  </div>
                  <span className={cn("absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white", cfg.dot)} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{cfg.label}</p>
                  <p className="text-[11px] text-gray-400 leading-tight">{cfg.desc}</p>
                </div>
                {active && <span className="w-2 h-2 rounded-full bg-black shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
