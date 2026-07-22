"use client";

import Image from "next/image";
import { ExportSquare, ArrowSwapHorizontal, DirectInbox, TickCircle } from "iconsax-react";
import type { Integration } from "./data";

export function IntegrationCard({
  integration,
  onConnectClick,
  onDisconnect,
  onUpdate,
  subtitle,
  busy,
}: {
  integration: Integration;
  onToggle?: (id: string) => void;
  onConnectClick?: () => void;
  onDisconnect?: () => void;
  onUpdate?: () => void;
  subtitle?: string;
  busy?: boolean;
}) {
  const { name, description, logo, connected } = integration;

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
        {connected ? (
          <>
            <span className="flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-full px-4 py-2">
              <TickCircle size={16} variant="Bold" />
              Connected
            </span>
            <div className="flex items-center gap-2">
              {onUpdate && (
                <button
                  type="button"
                  onClick={onUpdate}
                  className="text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-full px-4 py-2"
                >
                  Update
                </button>
              )}
              {onDisconnect && (
                <button
                  type="button"
                  onClick={onDisconnect}
                  className="text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-full px-4 py-2"
                >
                  Disconnect
                </button>
              )}
            </div>
          </>
        ) : (
          <button
            onClick={onConnectClick}
            disabled={busy}
            className="flex items-center gap-2 text-sm font-medium border border-gray-200 rounded-full px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <ArrowSwapHorizontal size={16} variant="Linear" />
            {busy ? "Connecting..." : "Connect"}
          </button>
        )}
      </div>
    </div>
  );
}
