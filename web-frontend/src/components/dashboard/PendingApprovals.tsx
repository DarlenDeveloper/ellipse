"use client";

import { MoreHorizontal } from "lucide-react";

const approvals = [
  {
    name: "Gmail Agent",
    icon: "✉️",
    date: "Jul 10 03:20 GMT",
    status: "Pending",
  },
  {
    name: "WhatsApp Agent",
    icon: "💬",
    date: "Jul 12 04:30 GMT",
    status: "Pending",
  },
  {
    name: "Web Agent",
    icon: "🌐",
    date: "Jul 14 05:40 GMT",
    status: "Pending",
  },
];

export function PendingApprovals() {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Pending Approvals</h2>
        <button className="text-gray-400 hover:text-gray-600">
          <MoreHorizontal size={18} />
        </button>
      </div>
      <div className="space-y-4">
        {approvals.map((item) => (
          <div key={item.name} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">{item.icon}</span>
              <div>
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-xs text-gray-500">{item.date}</p>
              </div>
            </div>
            <span className="text-xs border border-gray-200 rounded-lg px-3 py-1 text-gray-600">
              Pending
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
