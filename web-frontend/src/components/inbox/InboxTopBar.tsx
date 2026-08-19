"use client";

import { Add, SearchNormal1 } from "iconsax-react";

export function InboxTopBar({ value, onChange, onCompose, canCompose }: { value: string; onChange: (value: string) => void; onCompose: () => void; canCompose: boolean }) {
  return (
    <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 bg-white">
      <button type="button" onClick={onCompose} disabled={!canCompose} className="flex shrink-0 items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40"><Add size={18} color="#fff"/> Compose</button>
      <div className="w-full max-w-xl relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
          <SearchNormal1 size={18} variant="Linear" />
        </span>
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search by title, sender, or integration"
          aria-label="Search conversations"
          className="w-full bg-gray-100 rounded-full pl-11 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"
        />
      </div>
    </div>
  );
}
