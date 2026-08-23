"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight2, Sms, DirectInbox } from "iconsax-react";
import { cn } from "@/lib/utils";
import { useDashboardData } from "./DashboardData";

type Conversation = { id: string; subject?: string; customer_ref?: string; channel?: string; status?: string; last_message_at?: string | null };
const channelLogo: Record<string, string> = { "google-workspace": "/logos/gmail.png", zoho: "/logos/zoho.png", whatsapp: "/logos/whatsapp.png", microsoft365: "/logos/outlook.png" };
const channelName: Record<string, string> = { "google-workspace": "Gmail", zoho: "Zoho", whatsapp: "WhatsApp", microsoft365: "Outlook" };
const statusStyles: Record<string, string> = { open: "bg-emerald-50 text-emerald-700", pending: "bg-amber-50 text-amber-700", closed: "bg-gray-100 text-gray-500" };
function fmtDate(value?: string | null) { return value ? new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"; }

export function RecentThreads() {
  const { data, loading } = useDashboardData();
  const threads = data.recentThreads as Conversation[];

  return (
    <section className="rounded-[24px] border border-black/[0.04] bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.035)]" aria-labelledby="threads-title">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-2.5">
          <DirectInbox size={19} variant="Linear" color="#147a43" className="mt-0.5 shrink-0" />
          <div>
            <h2 id="threads-title" className="text-[17px] font-semibold leading-6 tracking-[-0.015em] text-gray-950">Recent conversations</h2>
            <p className="text-[12px] font-normal text-gray-400">Jump back into the threads that moved most recently</p>
          </div>
        </div>
        <Link href="/inbox" className="hidden items-center gap-1 text-[13px] font-medium text-gray-500 sm:flex">View inbox <ArrowRight2 size={13} /></Link>
      </div>

      <div className="hidden grid-cols-[minmax(0,1.7fr)_0.8fr_1.1fr_0.6fr_0.9fr_20px] gap-4 border-b border-gray-100 px-3 pb-2.5 text-[10px] font-medium uppercase tracking-[0.08em] text-gray-400 lg:grid">
        <span>Conversation</span><span>Channel</span><span>Customer</span><span>Status</span><span>Last activity</span><span />
      </div>

      {loading ? (
        <div className="space-y-2 pt-2">{[0,1,2,3].map((row) => <div key={row} className="flex animate-pulse items-center gap-4 px-3 py-2.5"><span className="h-5 w-5 rounded bg-gray-100" /><span className="flex-1"><span className="block h-3.5 w-1/2 rounded bg-gray-100" /><span className="mt-1.5 block h-2.5 w-1/3 rounded bg-gray-50" /></span></div>)}</div>
      ) : threads.length === 0 ? (
        <div className="rounded-2xl bg-gray-50 py-8 text-center">
          <p className="text-[13px] font-medium text-gray-600">No conversations yet</p>
          <p className="mt-1 text-[11px] font-normal text-gray-400">Connect a channel to start receiving messages.</p>
          <Link href="/integrations" className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-gray-900">Connect a channel <ArrowRight2 size={12} /></Link>
        </div>
      ) : (
        <div className="space-y-0.5 pt-1">
          {threads.slice(0, 6).map((thread) => {
            const logo = thread.channel ? channelLogo[thread.channel] : undefined;
            return (
              <Link key={thread.id} href={`/inbox?conversation=${encodeURIComponent(thread.id)}`} className="grid grid-cols-[24px_minmax(0,1fr)_16px] items-center gap-3 rounded-xl px-3 py-2.5 lg:grid-cols-[minmax(0,1.7fr)_0.8fr_1.1fr_0.6fr_0.9fr_20px] lg:gap-4">
                <div className="hidden min-w-0 lg:block"><span className="block truncate text-[13px] font-medium text-gray-900">{thread.subject || "(no subject)"}</span></div>
                <div className="hidden items-center gap-2 text-[12px] font-normal text-gray-600 lg:flex">
                  {logo ? <Image src={logo} alt="" width={18} height={18} className="h-[18px] w-[18px] shrink-0 object-contain" /> : <Sms size={16} />}
                  <span className="truncate">{thread.channel ? channelName[thread.channel] ?? thread.channel : "Other"}</span>
                </div>
                <div className="hidden min-w-0 lg:block"><span className="block truncate text-[12px] font-normal text-gray-500">{thread.customer_ref || "Unknown customer"}</span></div>
                <span className={cn("hidden w-fit rounded-full px-2.5 py-1 text-[10px] font-medium capitalize lg:inline-flex", statusStyles[thread.status ?? ""] ?? "bg-gray-50 text-gray-500")}>{thread.status || "unknown"}</span>
                <span className="hidden text-[11px] font-normal text-gray-400 lg:block">{fmtDate(thread.last_message_at)}</span>

                <span className="lg:hidden">{logo ? <Image src={logo} alt="" width={20} height={20} className="h-5 w-5 object-contain" /> : <Sms size={18} />}</span>
                <span className="min-w-0 lg:hidden"><span className="block truncate text-[13px] font-medium text-gray-900">{thread.subject || "(no subject)"}</span><span className="mt-0.5 block truncate text-[11px] font-normal text-gray-400">{thread.customer_ref || "Unknown customer"} · {fmtDate(thread.last_message_at)}</span></span>
                <ArrowRight2 size={13} className="text-gray-300" />
              </Link>
            );
          })}
        </div>
      )}

      <Link href="/inbox" className="mt-3 flex h-10 items-center justify-center gap-1 rounded-full bg-gray-100 text-[13px] font-medium text-gray-700 sm:hidden">View inbox <ArrowRight2 size={13} /></Link>
    </section>
  );
}
