"use client";

import { useState } from "react";
import { Add, More, Sms, Message, DirectInbox, Setting2, TickCircle, CloseCircle } from "iconsax-react";
import { cn } from "@/lib/utils";

type AgentStatus = "Active" | "Paused" | "Disabled";

type Agent = {
  id: string;
  name: string;
  channel: string;
  icon: typeof Sms;
  status: AgentStatus;
  messagesHandled: string;
  accuracy: string;
  lastActive: string;
  description: string;
};

const statusStyles: Record<AgentStatus, string> = {
  Active: "bg-green-50 text-green-700",
  Paused: "bg-yellow-50 text-yellow-700",
  Disabled: "bg-red-50 text-red-600",
};

const agents: Agent[] = [
  {
    id: "1",
    name: "Gmail Agent",
    channel: "Gmail",
    icon: Sms,
    status: "Active",
    messagesHandled: "4,200",
    accuracy: "97%",
    lastActive: "2 min ago",
    description: "Handles inbox triage, auto-replies, and escalation for Gmail threads.",
  },
  {
    id: "2",
    name: "WhatsApp Agent",
    channel: "WhatsApp",
    icon: Message,
    status: "Active",
    messagesHandled: "3,800",
    accuracy: "94%",
    lastActive: "5 min ago",
    description: "Manages WhatsApp Business conversations with casual tone adaptation.",
  },
  {
    id: "3",
    name: "SMTP Agent",
    channel: "SMTP/IMAP",
    icon: DirectInbox,
    status: "Paused",
    messagesHandled: "1,100",
    accuracy: "92%",
    lastActive: "1 hour ago",
    description: "Processes custom email server messages and categorizes by priority.",
  },
  {
    id: "4",
    name: "Boss Agent",
    channel: "All Channels",
    icon: Setting2,
    status: "Active",
    messagesHandled: "890",
    accuracy: "95%",
    lastActive: "1 min ago",
    description: "Orchestrates all channel agents. Cross-channel decisions, escalation, and follow-ups.",
  },
];

export default function AgentsPage() {
  const [agentList] = useState(agents);

  return (
    <main className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Channel Agents</h1>
          <p className="text-gray-400 mt-1">Gemini-powered agents that manage each communication channel.</p>
        </div>
        <button className="flex items-center gap-2 bg-black text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-gray-800">
          <Add size={18} variant="Linear" color="#ffffff" />
          New Agent
        </button>
      </div>

      {/* Agent Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {agentList.map((agent) => (
          <div
            key={agent.id}
            className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-md transition-shadow"
          >
            {/* Top row */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center">
                  <agent.icon size={24} variant="Bold" color="#1a1a1a" />
                </div>
                <div>
                  <h3 className="text-base font-bold">{agent.name}</h3>
                  <p className="text-xs text-gray-400">{agent.channel}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("text-xs font-medium rounded-full px-3 py-1", statusStyles[agent.status])}>
                  {agent.status}
                </span>
                <button className="text-gray-300 hover:text-gray-500">
                  <More size={18} variant="Bold" />
                </button>
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-gray-500 leading-relaxed mb-4">{agent.description}</p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
              <div>
                <p className="text-lg font-bold">{agent.messagesHandled}</p>
                <p className="text-xs text-gray-400">Messages Handled</p>
              </div>
              <div>
                <p className="text-lg font-bold">{agent.accuracy}</p>
                <p className="text-xs text-gray-400">Accuracy</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">{agent.lastActive}</p>
                <p className="text-xs text-gray-400">Last Active</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
