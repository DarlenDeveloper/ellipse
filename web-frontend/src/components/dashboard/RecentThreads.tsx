"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight2, Sms } from "iconsax-react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { db } from "@/lib/firebase";
import { useEnterpriseId } from "@/lib/use-enterprise";

type Conversation = {
  id: string;
  subject?: string;
  customer_ref?: string;
  channel?: string;
  status?: string;
  last_message_at?: { toDate: () => Date };
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

function fmtDate(ts?: { toDate: () => Date }): string {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RecentThreads() {
  const { enterpriseId } = useEnterpriseId();
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enterpriseId) return;
    const unsub = onSnapshot(
      query(collection(db, "conversations"), where("enterprise_id", "==", enterpriseId)),
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Conversation, "id">) }))
          .sort(
            (a, b) =>
              (b.last_message_at?.toDate?.().getTime() ?? 0) -
              (a.last_message_at?.toDate?.().getTime() ?? 0)
          )
          .slice(0, 6);
        setThreads(rows);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [enterpriseId]);

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
        <p className="text-sm text-gray-400 px-3 py-6">Loading…</p>
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
