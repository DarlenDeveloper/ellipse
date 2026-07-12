"use client";

import { More, ArrowDown2, ExportSquare, Sms, Message, DirectInbox } from "iconsax-react";
import { cn } from "@/lib/utils";

const threads = [
  {
    subject: "Order Inquiry #4521",
    channel: "Gmail",
    channelIcon: Sms,
    customer: "Acme Corp",
    status: "Pending",
    date: "Jul 10 03:20 GMT",
  },
  {
    subject: "Support Request",
    channel: "WhatsApp",
    channelIcon: Message,
    customer: "TechStart Inc",
    status: "Active",
    date: "Jul 08 04:30 GMT",
  },
  {
    subject: "Invoice Follow-up",
    channel: "SMTP",
    channelIcon: DirectInbox,
    customer: "Global Ltd",
    status: "Expired",
    date: "Jul 02 05:40 GMT",
  },
];

const statusStyles: Record<string, string> = {
  Pending: "bg-yellow-50 text-yellow-700",
  Active: "bg-green-50 text-green-700",
  Expired: "bg-red-50 text-red-600",
};

export function RecentThreads() {
  return (
    <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold tracking-tight">Manage Threads</h2>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 text-sm font-medium border border-gray-200 rounded-full px-4 py-2 text-gray-600 hover:bg-gray-50">
            Status
            <ArrowDown2 size={14} variant="Linear" color="#6b7280" />
          </button>
          <button className="flex items-center gap-2 text-sm font-medium bg-black text-white rounded-full px-4 py-2 hover:bg-gray-800">
            Export
            <ExportSquare size={14} variant="Linear" color="#ffffff" />
          </button>
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr_1fr_40px] gap-4 px-3 py-3 text-xs text-gray-400 font-medium">
        <span>Subject</span>
        <span>Channel</span>
        <span>Customer</span>
        <span>Status</span>
        <span>Date</span>
        <span></span>
      </div>

      {/* Table Rows */}
      <div className="space-y-1">
        {threads.map((thread) => (
          <div
            key={thread.subject}
            className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr_1fr_40px] gap-4 px-3 py-3.5 items-center hover:bg-gray-50 rounded-2xl transition-colors"
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                className="w-4 h-4 rounded-md border-gray-300 accent-black"
              />
              <span className="text-sm font-semibold">{thread.subject}</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-gray-700">
              <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center">
                <thread.channelIcon size={16} variant="Bold" color="#1a1a1a" />
              </div>
              {thread.channel}
            </div>
            <span className="text-sm text-gray-600">{thread.customer}</span>
            <span
              className={cn(
                "text-xs font-medium rounded-full px-3 py-1 w-fit",
                statusStyles[thread.status]
              )}
            >
              {thread.status}
            </span>
            <span className="text-sm text-gray-400">{thread.date}</span>
            <button className="text-gray-300 hover:text-gray-500 flex justify-center">
              <More size={18} variant="Bold" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
