"use client";

import Image from "next/image";
import { ExportSquare, ArrowSwapHorizontal, DirectInbox } from "iconsax-react";
import { cn } from "@/lib/utils";
import type { Integration } from "./data";

export function IntegrationCard({
  integration,
  onConnectClick,
  subtitle,
  busy,
}: {
  integration: Integration;
  onToggle?: (id: string) => void;
  onConnectClick?: () => void;
  subtitle?: string;
  busy?: boolean;
}) {
  const { name, description, logo, tileClass, connected } = integration;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="w-14 h-14 flex items-center justify-center">
          {logo ? (
            <Image src={logo} alt={name} width={48} height={48} className="w-12 h-12 object-contain" />
          ) : (
            <DirectInbox size={40} variant="Bold" color="#475569" />
          )}
        </div>
        <button className="text-gray-300 hover:text-gray-500">
          <ExportSquare size={18} variant="Linear" />
        </button>
      </div>

      {/* Body */}
      <h3 className="text-base font-bold mt-4">{name}</h3>
      <p className="text-sm text-gray-400 mt-1 leading-relaxed flex-1">
        {subtitle ? <span className="text-gray-600 font-medium">{subtitle}</span> : description}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-5 pt-4 border-t border-gray-100">
        <button
          onClick={onConnectClick}
          disabled={busy || (connected && !onConnectClick)}
          className="flex items-center gap-2 text-sm font-medium border border-gray-200 rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <ArrowSwapHorizontal size={16} variant="Linear" />
          {busy ? "Connecting..." : connected ? "Connected" : "Connect"}
        </button>

        {/* Status indicator (reflects connection, not interactive yet) */}
        <div
          title={connected ? "Enabled" : "Not connected"}
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
        </div>
      </div>
    </div>
  );
}
