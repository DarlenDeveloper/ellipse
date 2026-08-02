"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight2, Sms } from "iconsax-react";
import { cn } from "@/lib/utils";
import { useDashboardData } from "./DashboardData";

type Conversation = {
  id: string;
  subject?: string;
  customer_ref?: string;
  channel?: string;
  status?: string;
  last_message_at?: string | null;
};

const channelLogo: Record<string, string> = {
  "google-workspace": "/logos/gmail.png",
  zoho: "/logos/zoho.png",
  whatsapp: "/logos/whatsapp.png",
  microsoft365: "/logos/outlook.png",
};

const channelName: Record<string, string> = {
  "google-workspace": "Gmail",
  zoho: "Zoho",
  whatsapp: "WhatsApp",
  microsoft365: "Outlook",
};

const statusStyles: Record<string, string> = {
  open: "bg-green-50 text-green-700",
  pending: "bg-yellow-50 text-yellow-700",
  closed: "bg-gray-100 text-gray-500",
};

function fmtDate(value?: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RecentThreads() {
  const { data, loading } = useDashboardData();
  const threads = data.recentThreads as Conversation[];

  return (
    <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold tracking-tight">Recent Threads</h2>
        <Link
          href="/inbox"
          className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-black"
        >
          View inbox
          <ArrowRight2 size={14} variant="Linear" />
        </Link>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr_1.2fr_0.8fr_1fr] gap-4 px-3 py-3 text-xs text-gray-400 font-medium">
        <span>Subject</span>
        <span>Channel</span>
        <span>Customer</span>
        <span>Status</span>
        <span>Last activity</span>
      </div>

      {loading ? (
        <div className="space-y-2" aria-label="Loading recent threads">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="grid animate-pulse grid-cols-[1.6fr_1fr_1.2fr_0.8fr_1fr] items-center gap-4 px-3 py-3.5">
              <span className="h-4 w-4/5 rounded bg-gray-100" /><span className="h-4 w-20 rounded bg-gray-100" /><span className="h-4 w-3/4 rounded bg-gray-100" /><span className="h-7 w-16 rounded-full bg-gray-100" /><span className="h-4 w-20 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ) : threads.length === 0 ? (
        <p className="text-sm text-gray-400 px-3 py-6">No threads yet. Connect a channel to get started.</p>
      ) : (
        <div className="space-y-1">
          {threads.map((t) => {
            const logo = t.channel ? channelLogo[t.channel] : undefined;
            return (
              <div
                key={t.id}
                className="grid grid-cols-[1.6fr_1fr_1.2fr_0.8fr_1fr] gap-4 px-3 py-3.5 items-center hover:bg-gray-50 rounded-2xl transition-colors"
              >
                <span className="text-sm font-semibold truncate">{t.subject || "(no subject)"}</span>
                <div className="flex items-center gap-2.5 text-sm text-gray-700">
                  <div className="w-6 h-6 flex items-center justify-center shrink-0">
                    {logo ? (
                      <Image src={logo} alt="" width={22} height={22} className="w-[22px] h-[22px] object-contain" />
                    ) : (
                      <Sms size={18} variant="Bold" color="#1a1a1a" />
                    )}
                  </div>
                  {t.channel ? channelName[t.channel] ?? t.channel : "—"}
                </div>
                <span className="text-sm text-gray-600 truncate">{t.customer_ref || "—"}</span>
                <span
                  className={cn(
                    "text-xs font-medium rounded-full px-3 py-1 w-fit",
                    statusStyles[t.status ?? ""] ?? "bg-gray-50 text-gray-500"
                  )}
                >
                  {t.status ? t.status.charAt(0).toUpperCase() + t.status.slice(1) : "—"}
                </span>
                <span className="text-sm text-gray-400">{fmtDate(t.last_message_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
