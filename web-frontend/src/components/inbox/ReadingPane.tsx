"use client";

import { Archive, Trash, Star1, Flag, Clock, More, DocumentText } from "iconsax-react";
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

// Strip HTML/CSS down to clean, readable text.
function htmlToText(input: string): string {
  let s = input;
  // Drop non-content blocks entirely.
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<head[\s\S]*?<\/head>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  // Turn block-level tags into line breaks.
  s = s.replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6]|\/table)\b[^>]*>/gi, "\n");
  // Remove all remaining tags.
  s = s.replace(/<[^>]+>/g, "");
  // Remove leftover/orphaned CSS rules (e.g. ".lf-progress { ... }").
  s = s.replace(/[.#]?[\w-]+(?:::?[\w-]+)?\s*\{[^{}]*\}/g, "");
  // Decode common HTML entities.
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
  // Collapse whitespace.
  s = s.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

// Turn bare URLs into clickable links.
function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-purple-600 underline break-all"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/** Renders an email body as clean, readable text (HTML stripped, links kept). */
function MessageBody({ body, snippet }: { body?: string; snippet?: string }) {
  const raw = body || snippet || "";
  if (!raw) return null;
  const text = htmlToText(raw);

  return (
    <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-w-3xl break-words">
      {linkify(text)}
    </div>
  );
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
              <MessageBody body={msg.body} snippet={msg.snippet} />
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-8">
          <button className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-full px-6 py-2.5">
            <DocumentText size={18} variant="Linear" color="#ffffff" />
            Summarise
          </button>
        </div>
      </div>
    </div>
  );
}
