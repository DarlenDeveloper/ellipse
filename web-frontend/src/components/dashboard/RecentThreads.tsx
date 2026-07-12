"use client";

import { MoreHorizontal } from "lucide-react";

const threads = [
  {
    subject: "Order Inquiry #4521",
    channel: "Gmail",
    channelIcon: "✉️",
    customer: "Acme Corp",
    status: "Pending",
    date: "Jul 10 03:20 GMT",
  },
  {
    subject: "Support Request",
    channel: "WhatsApp",
    channelIcon: "💬",
    customer: "TechStart Inc",
    status: "Active",
    date: "Jul 08 04:30 GMT",
  },
  {
    subject: "Invoice Follow-up",
    channel: "SMTP",
    channelIcon: "📧",
    customer: "Global Ltd",
    status: "Resolved",
    date: "Jul 02 05:40 GMT",
  },
  {
    subject: "Partnership Proposal",
    channel: "Gmail",
    channelIcon: "✉️",
    customer: "Innovate Co",
    status: "Active",
    date: "Jul 11 09:15 GMT",
  },
];

const statusStyles: Record<string, string> = {
  Pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  Active: "bg-green-50 text-green-700 border-green-200",
  Resolved: "bg-gray-50 text-gray-600 border-gray-200",
};

export function RecentThreads() {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Recent Threads</h2>
        <div className="flex items-center gap-2">
          <button className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50">
            Status ↓
          </button>
          <button className="text-sm bg-black text-white rounded-lg px-3 py-1.5 hover:bg-gray-800">
            Export ↓
          </button>
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-[1fr_140px_140px_100px_160px_40px] gap-4 px-3 py-2 text-xs text-gray-500 font-medium border-b border-gray-100">
        <span>Subject</span>
        <span>Channel</span>
        <span>Customer</span>
        <span>Status</span>
        <span>Date</span>
        <span></span>
      </div>

      {/* Table Rows */}
      <div className="divide-y divide-gray-50">
        {threads.map((thread) => (
          <div
            key={thread.subject}
            className="grid grid-cols-[1fr_140px_140px_100px_160px_40px] gap-4 px-3 py-3 items-center hover:bg-gray-50 rounded-lg"
          >
            <div className="flex items-center gap-3">
              <input type="checkbox" className="rounded border-gray-300" />
              <span className="text-sm font-medium">{thread.subject}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span>{thread.channelIcon}</span>
              {thread.channel}
            </div>
            <span className="text-sm text-gray-700">{thread.customer}</span>
            <span
              className={`text-xs border rounded-md px-2 py-0.5 w-fit ${statusStyles[thread.status]}`}
            >
              {thread.status}
            </span>
            <span className="text-sm text-gray-500">{thread.date}</span>
            <button className="text-gray-400 hover:text-gray-600">
              <MoreHorizontal size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
