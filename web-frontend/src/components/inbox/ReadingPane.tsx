"use client";

import { Archive, Trash, Star1, Flag, Clock, More, RotateLeft, Share } from "iconsax-react";
import { cn } from "@/lib/utils";

type Conversation = {
  id: string;
  subject: string;
  customer_ref: string;
} | null;

type Message = {
  id: string;
  from: string;
  from_email: string;
  subject: string;
  body: string;
  snippet: string;
  sender_type: "us" | "customer";
  timestamp?: { toDate: () => Date };
};

function fmtFull(ts?: { toDate: () => Date }): string {
  if (!ts) return "";
  return ts.toDate().toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ReadingPane({
  conversation,
  messages,
}: {
  conversation: Conversation;
  messages: Message[];
}) {
  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white text-gray-400 text-sm">
        Select a conversation to read it.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-6 py-4 border-b border-gray-100">
        {[Archive, Trash, Star1, Flag, Clock].map((Icon, i) => (
          <button key={i} className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100">
            <Icon size={18} variant="Linear" />
          </button>
        ))}
        <button className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 ml-1">
          <More size={18} variant="Linear" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <h1 className="text-2xl font-bold tracking-tight mb-6">{conversation.subject}</h1>

        <div className="space-y-6">
          {messages.map((msg) => (
            <div key={msg.id} className="border-b border-gray-50 pb-6">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold",
                      msg.sender_type === "us" ? "bg-black text-white" : "bg-purple-200 text-purple-700"
                    )}
                  >
                    {(msg.from_email?.[0] ?? "?").toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{msg.from}</p>
                    <p className="text-xs text-gray-400">
                      {msg.sender_type === "us" ? "Sent" : "to you"}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-gray-400 shrink-0">{fmtFull(msg.timestamp)}</span>
              </div>
              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-w-3xl">
                {msg.body || msg.snippet}
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-8">
          <button className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-full px-6 py-2.5">
            <RotateLeft size={18} variant="Linear" color="#ffffff" />
            Reply
          </button>
          <button className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-full px-6 py-2.5">
            <Share size={18} variant="Linear" color="#ffffff" />
            Forward
          </button>
        </div>
      </div>
    </div>
  );
}
