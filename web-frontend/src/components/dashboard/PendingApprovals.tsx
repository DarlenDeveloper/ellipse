"use client";

import { More, Sms, Message, Global } from "iconsax-react";

const approvals = [
  { name: "Gmail Agent", icon: Sms, date: "Jul 10 03:20 GMT" },
  { name: "WhatsApp Agent", icon: Message, date: "Jul 12 04:30 GMT" },
  { name: "Web Agent", icon: Global, date: "Jul 14 05:40 GMT" },
];

export function PendingApprovals() {
  return (
    <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold tracking-tight">Pending Approvals</h2>
        <button className="text-gray-300 hover:text-gray-500">
          <More size={20} variant="Bold" />
        </button>
      </div>
      <div className="space-y-5">
        {approvals.map((item) => (
          <div key={item.name} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
                <item.icon size={20} variant="Bold" color="#1a1a1a" />
              </div>
              <div>
                <p className="text-sm font-semibold">{item.name}</p>
                <p className="text-xs text-gray-400">{item.date}</p>
              </div>
            </div>
            <span className="text-xs font-medium border border-gray-200 rounded-full px-4 py-1.5 text-gray-500">
              Pending
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
