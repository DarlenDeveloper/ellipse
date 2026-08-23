"use client";

import Link from "next/link";
import Image from "next/image";
import { Cpu, ArrowRight2, TickCircle } from "iconsax-react";
import { useDashboardData } from "./DashboardData";

type PendingAction = { id: string; agent_id?: string; target_system?: string; action_type?: string; status?: string; created_at?: string | null };
const agentLogos: Record<string, string> = { "gmail-agent": "/logos/gmail.png", "microsoft365-agent": "/logos/outlook.png", "smtp-agent": "/logos/smtp.png", "whatsapp-agent": "/logos/whatsapp.png", "zoho-agent": "/logos/zoho.png" };
function agentLabel(id?: string) { return id ? id.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") : "Agent"; }
function actionLabel(type?: string) { if (!type) return "Review action"; const value = type.replace(/_/g, " "); return value.charAt(0).toUpperCase() + value.slice(1); }
function formatDate(value?: string | null) { return value ? new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Recently"; }

export function PendingApprovals() {
  const { data, loading } = useDashboardData();
  const items = data.pendingApprovals as PendingAction[];

  return (
    <section className="flex flex-col rounded-[22px] border border-black/[0.04] bg-[#fff8ee] p-4 shadow-[0_8px_28px_rgba(15,23,42,0.035)]" aria-labelledby="queue-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-[#b76b1f]">Priority queue</p>
          <h2 id="queue-title" className="text-[16px] font-semibold leading-6 tracking-[-0.015em] text-gray-950">Needs your review</h2>
          <p className="text-[11px] font-normal text-gray-500">Agent actions waiting for a decision</p>
        </div>
        <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-2 text-[12px] font-semibold text-gray-900">{loading ? "–" : items.length}</span>
      </div>

      <div className="mt-3 space-y-1.5">
        {loading ? (
          [0,1,2].map((item) => <div key={item} className="flex animate-pulse items-center gap-2.5 rounded-xl bg-white/70 px-2.5 py-2"><span className="h-5 w-5 rounded bg-orange-100" /><span className="flex-1"><span className="block h-3 w-24 rounded bg-orange-100" /><span className="mt-1 block h-2.5 w-32 rounded bg-orange-50" /></span></div>)
        ) : items.length === 0 ? (
          <div className="flex min-h-28 flex-col items-center justify-center text-center">
            <TickCircle size={23} variant="Linear" color="#15803d" />
            <p className="mt-1.5 text-[12px] font-medium text-gray-800">You’re all caught up</p>
            <p className="mt-0.5 max-w-[210px] text-[10px] font-normal leading-4 text-gray-400">New agent actions will appear here when they need approval.</p>
          </div>
        ) : (
          items.slice(0, 3).map((item) => (
            <Link key={item.id} href="/approvals" className="flex items-center gap-2.5 rounded-xl border border-orange-100/70 bg-white/90 px-2.5 py-2">
              {item.agent_id && agentLogos[item.agent_id] ? <Image src={agentLogos[item.agent_id]} alt="" width={20} height={20} className="h-5 w-5 shrink-0 object-contain" /> : <Cpu size={17} variant="Linear" color="#374151" className="shrink-0" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-gray-900">{actionLabel(item.action_type)}</span>
                <span className="block truncate text-[10px] font-normal text-gray-400">{agentLabel(item.agent_id)} · {formatDate(item.created_at)}</span>
              </span>
              <ArrowRight2 size={12} className="shrink-0 text-gray-300" />
            </Link>
          ))
        )}
      </div>

      <Link href="/approvals" className="mt-3 inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-gray-950 text-[12px] font-medium text-white">Review all actions <ArrowRight2 size={12} color="currentColor" /></Link>
    </section>
  );
}
