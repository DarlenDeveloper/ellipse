"use client";

import { useEffect, useState } from "react";
import { DocumentText, Send2, Messages2, Clock, CloseCircle } from "iconsax-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { cn } from "@/lib/utils";

type Conversation = {
  id: string;
  subject: string;
  customer_ref: string;
  channel?: string;
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
  // Normalize line endings first. Many HTML emails use CRLF; leaving the `\r`
  // behind prevents repeated blank lines from collapsing correctly.
  let s = input.replace(/\r\n?/g, "\n");
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
  // Email templates frequently use invisible characters and whitespace-only
  // table rows as visual spacers. They have no meaning in the text view.
  s = s
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
    <div className="text-sm text-gray-700 leading-7 whitespace-pre-wrap max-w-[760px] break-words">
      {linkify(text)}
    </div>
  );
}

export function ReadingPane({
  conversation,
  messages,
  enterpriseId,
  messagesLoading,
  messagesError,
}: {
  conversation: Conversation;
  messages: Message[];
  enterpriseId: string | null;
  messagesLoading?: boolean;
  messagesError?: string | null;
}) {
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState<"brief" | "draft" | "tasks" | "ask" | null>(null);
  const [aiResult, setAiResult] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    setAiMode(null);
    setAiResult("");
    setAiQuestion("");
    setAiError(null);
  }, [conversation?.id]);

  const conversationContext = () => {
    if (!conversation) return "";
    const transcript = messages.slice(-12).map((message) => {
      const sender = message.sender_type === "us" ? "Our team" : message.from || message.from_email || "Customer";
      return `${sender}: ${(message.body || message.snippet || "").slice(0, 1800)}`;
    });
    return [
      `Conversation title: ${conversation.subject}`,
      `Customer: ${conversation.customer_ref}`,
      `Channel: ${conversation.channel ?? "unknown"}`,
      "Recent transcript:",
      ...transcript,
    ].join("\n");
  };

  const runAi = async (mode: "brief" | "draft" | "tasks" | "ask", question?: string) => {
    if (!conversation || !enterpriseId || aiLoading) return;
    setAiMode(mode);
    setAiResult("");
    setAiError(null);
    setAiLoading(true);
    const instruction =
      mode === "brief"
        ? "Create a concise personalized AI brief for me. Use headings: Why this matters to me, What changed, My actions, Risks or deadlines, Suggested next step. Do not invent facts."
        : mode === "draft"
        ? "Draft a ready-to-send reply in the appropriate tone for this channel. Return only the reply text, with no commentary or markdown heading."
        : mode === "tasks"
        ? "Extract concrete action items. For each, state the task, suggested owner, due date if explicitly known, and priority. Clearly label missing dates instead of inventing them."
        : `Answer my question about this conversation using only grounded workspace and transcript context. Question: ${question ?? ""}`;
    try {
      const result = await httpsCallable(functions, "askAgent")({
        enterpriseId,
        agentId: "ivy",
        message: `${instruction}\n\n${conversationContext()}`,
        history: [],
      });
      const data = result.data as { reply?: string };
      setAiResult(data.reply?.trim() || "Ivy did not return a response.");
    } catch (e) {
      setAiError((e as Error).message || "Ivy could not analyze this conversation.");
    } finally {
      setAiLoading(false);
    }
  };

  const send = async () => {
    if (!reply.trim() || !conversation || !enterpriseId || sending) return;
    setSending(true);
    setError(null);
    try {
      await httpsCallable(functions, "sendReply")({
        enterpriseId,
        conversationId: conversation.id,
        body: reply.trim(),
      });
      setReply("");
    } catch (e) {
      const msg = (e as { message?: string })?.message || "";
      setError(
        /access blocked|token|expired|OAuth/i.test(msg)
          ? "WhatsApp rejected the send — the access token has expired or is blocked. Reconnect WhatsApp with a fresh token."
          : msg || "Couldn't send. Please try again."
      );
      console.error(e);
    } finally {
      setSending(false);
    }
  };

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
      <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 overflow-x-auto">
        <button onClick={() => runAi("brief")} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-full px-4 py-2 whitespace-nowrap">
          <DocumentText size={16} variant="Linear" color="#ffffff" /> AI Brief
        </button>
        <button onClick={() => runAi("draft")} className="flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-full px-4 py-2 whitespace-nowrap">
          <Send2 size={16} variant="Linear" /> Draft reply
        </button>
        <button onClick={() => runAi("tasks")} className="flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-full px-4 py-2 whitespace-nowrap">
          <Clock size={16} variant="Linear" /> Create tasks
        </button>
        <button onClick={() => { setAiMode("ask"); setAiResult(""); setAiError(null); }} className="flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-full px-4 py-2 whitespace-nowrap">
          <Messages2 size={16} variant="Linear" /> Ask Ivy
        </button>
      </div>

      {aiMode && (
        <div className="border-b border-purple-100 bg-purple-50/50 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wide text-purple-700">
                {aiMode === "brief" ? "Personalized AI Brief" : aiMode === "draft" ? "Suggested reply" : aiMode === "tasks" ? "Suggested tasks" : "Ask Ivy"}
              </p>
              {aiMode === "ask" && !aiLoading && !aiResult && (
                <div className="flex gap-2 mt-3">
                  <input
                    value={aiQuestion}
                    onChange={(event) => setAiQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && aiQuestion.trim()) runAi("ask", aiQuestion.trim());
                    }}
                    placeholder="What do you want to know about this conversation?"
                    className="flex-1 bg-white border border-purple-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"
                  />
                  <button disabled={!aiQuestion.trim()} onClick={() => runAi("ask", aiQuestion.trim())} className="bg-black text-white text-sm rounded-xl px-4 py-2 disabled:opacity-40">Ask</button>
                </div>
              )}
              {aiLoading && <p className="text-sm text-gray-500 mt-2 animate-pulse">Ivy is analyzing this conversation…</p>}
              {aiError && <p className="text-sm text-red-600 mt-2">{aiError}</p>}
              {aiResult && <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mt-2 max-h-64 overflow-y-auto">{aiResult}</div>}
              {aiMode === "draft" && aiResult && conversation.channel === "whatsapp" && (
                <button onClick={() => setReply(aiResult)} className="mt-3 text-xs font-semibold text-purple-700 hover:text-purple-900">Use this reply</button>
              )}
            </div>
            <button onClick={() => setAiMode(null)} className="text-gray-400 hover:text-gray-700" aria-label="Close AI panel">
              <CloseCircle size={20} variant="Linear" />
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <h1 className="text-2xl font-bold tracking-tight mb-6">{conversation.subject}</h1>

        {messagesLoading && <p className="text-sm text-gray-400 animate-pulse">Loading conversation…</p>}
        {messagesError && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{messagesError}</p>}
        {!messagesLoading && !messagesError && messages.length === 0 && (
          <p className="text-sm text-gray-400">No message content is available for this conversation yet.</p>
        )}

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

      </div>

      {/* Reply composer — WhatsApp only */}
      {conversation.channel === "whatsapp" && (
      <div className="border-t border-gray-100 px-6 py-4 bg-white">
        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
        <div className="flex items-end gap-3 bg-gray-50 rounded-2xl px-4 py-2.5">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={`Reply to ${conversation.customer_ref}…`}
            className="flex-1 resize-none bg-transparent outline-none text-sm py-1.5 max-h-32"
          />
          <button
            onClick={send}
            disabled={!reply.trim() || sending}
            className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center hover:bg-gray-800 disabled:opacity-40 shrink-0"
          >
            <Send2 size={16} variant="Bold" color="#ffffff" />
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
