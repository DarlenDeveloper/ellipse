"use client";

import { RotateLeft } from "iconsax-react";
import { cn } from "@/lib/utils";
import { messages } from "./data";

export function MessageList({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="w-[380px] shrink-0 border-r border-gray-100 flex flex-col bg-white">
      {/* List header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
        <h2 className="text-lg font-bold tracking-tight">Primary</h2>
        <button className="text-gray-400 hover:text-gray-600">
          <RotateLeft size={18} variant="Linear" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map((msg) => {
          const active = msg.id === selectedId;
          return (
            <button
              key={msg.id}
              onClick={() => onSelect(msg.id)}
              className={cn(
                "w-full text-left rounded-2xl p-4 transition-colors border",
                active
                  ? "bg-purple-50 border-purple-200"
                  : "bg-white border-transparent hover:bg-gray-50"
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0",
                    msg.avatarColor
                  )}
                >
                  {msg.initial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold truncate">
                      {msg.sender}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {msg.time}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-800 truncate mt-0.5">
                    {msg.subject}
                  </p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {msg.preview}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
