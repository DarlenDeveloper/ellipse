"use client";

import { ExportSquare, ArrowSwapHorizontal } from "iconsax-react";
import { cn } from "@/lib/utils";
import type { Integration } from "./data";

export function IntegrationCard({
  integration,
  onToggle,
}: {
  integration: Integration;
  onToggle: (id: string) => void;
}) {
  const { name, description, mark, tileClass, connected } = integration;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div
          className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold",
            tileClass
          )}
        >
          {mark}
        </div>
        <button className="text-gray-300 hover:text-gray-500">
          <ExportSquare size={18} variant="Linear" />
        </button>
      </div>

      {/* Body */}
      <h3 className="text-base font-bold mt-4">{name}</h3>
      <p className="text-sm text-gray-400 mt-1 leading-relaxed flex-1">
        {description}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
        <button className="flex items-center gap-2 text-sm font-medium border border-gray-200 rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-50">
          <ArrowSwapHorizontal size={16} variant="Linear" />
          {connected ? "Connected" : "Connect"}
        </button>

        {/* Toggle */}
        <button
          onClick={() => onToggle(integration.id)}
          className={cn(
            "relative w-11 h-6 rounded-full transition-colors",
            connected ? "bg-blue-500" : "bg-gray-200"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
              connected ? "translate-x-[22px]" : "translate-x-0.5"
            )}
          />
        </button>
      </div>
    </div>
  );
}
