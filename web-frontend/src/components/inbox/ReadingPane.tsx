"use client";

import { useEffect, useRef, useState } from "react";
import { DocumentText, Send2, Messages2, Clock, CloseCircle, Paperclip2, Trash, Maximize4, Minus, ArrowUp2 } from "iconsax-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import { MarkdownText } from "@/components/MarkdownText";
import { useAuth } from "@/lib/auth-context";

type Conversation = {
  id: string;
  subject: string;
  customer_ref: string;
  channel?: string;
  account_email?: string;
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
  to?: string;
  cc?: string;
  attachment?: { fileName?: string; size?: number; documentId?: string };
  attachments?: { documentId: string; fileName: string; contentType: string; size: number; url: string }[];
};

type ProposedTask = {
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  due_at: string | null;
  due_text: string;
  confidence: number;
  calendar_recommended: boolean;
  add_to_calendar?: boolean;
  saved?: boolean;
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
  // Preserve HTML anchor destinations before stripping markup. Email templates
  // commonly render only "Click here", which otherwise loses its URL.
  s = s.replace(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href, label) => {
    const cleanLabel = String(label).replace(/<[^>]+>/g, "").trim();
    const cleanHref = String(href).replace(/&amp;/gi, "&").trim();
    if (!/^(https?:\/\/|mailto:)/i.test(cleanHref)) return cleanLabel;
    return cleanLabel && cleanLabel !== cleanHref ? `${cleanLabel} (${cleanHref})` : cleanHref;
  });
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
  const parts = text.split(/((?:https?:\/\/|mailto:)[^\s)]+)/g);
  return parts.map((part, i) =>
    /^(?:https?:\/\/|mailto:)/.test(part) ? (
      <a
        key={i}
        href={part.replace(/[.,;:]$/, "")}
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
  const { user } = useAuth();
  const [reply, setReply] = useState("");
  const [cc, setCc] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMinimized, setComposerMinimized] = useState(false);
  const [composerMaximized, setComposerMaximized] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState<"brief" | "draft" | "tasks" | "ask" | null>(null);
  const [aiResult, setAiResult] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [proposedTasks, setProposedTasks] = useState<ProposedTask[]>([]);
  const [savingTasks, setSavingTasks] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const attachmentRef = useRef<HTMLInputElement>(null);
  const canReply = ["google-workspace", "smtp", "microsoft365", "whatsapp"].includes(conversation?.channel ?? "");
  const isEmail = ["google-workspace", "smtp", "microsoft365"].includes(conversation?.channel ?? "");

  const draftKey = conversation && user ? `ellipse_reply_draft_${user.uid}_${conversation.id}` : null;
  const updateReply = (value: string) => {
    setReply(value);
    if (!draftKey) return;
    try {
      if (value) window.localStorage.setItem(draftKey, value);
      else window.localStorage.removeItem(draftKey);
    } catch {
      // Draft persistence is a convenience; private browsing may disable it.
    }
  };

  useEffect(() => {
    setAiMode(null);
    setAiResult("");
    setAiQuestion("");
    setAiError(null);
    setProposedTasks([]);
    let savedDraft = "";
    if (conversation?.id && user) {
      try { savedDraft = window.localStorage.getItem(`ellipse_reply_draft_${user.uid}_${conversation.id}`) ?? ""; } catch { /* unavailable */ }
    }
    setReply(savedDraft);
    setCc("");
    setAttachment(null);
    setComposerOpen(false);
    setComposerMinimized(false);
    setComposerMaximized(false);
    setError(null);
    setSendNotice(null);
  }, [conversation?.id, user]);

  // Behave like Reply all: carry the latest inbound message's original CC list
  // into the composer. The user can still edit or remove recipients before send.
  useEffect(() => {
    if (!isEmail) return;
    const latestInbound = [...messages].reverse().find((message) => message.sender_type === "customer");
    const excluded = new Set([conversation?.account_email, latestInbound?.from_email]
      .filter(Boolean)
      .map((address) => String(address).toLowerCase()));
    const replyAll = [latestInbound?.to, latestInbound?.cc]
      .filter(Boolean)
      .flatMap((value) => String(value).split(","))
      .map((value) => value.match(/<([^>]+)>/)?.[1] ?? value)
      .map((value) => value.trim())
      .filter((value) => value && !excluded.has(value.toLowerCase()));
    setCc(Array.from(new Set(replyAll.map((value) => value.toLowerCase()))).join(", "));
  }, [conversation?.id, conversation?.account_email, isEmail, messages]);

  const conversationContext = () => {
    if (!conversation) return "";
    const transcript = messages.slice(-12).map((message) => {
      const sender = message.sender_type === "us" ? "Our team" : message.from || message.from_email || "Customer";
      const receivedFiles = message.attachments?.map((file) => `${file.fileName} (${file.contentType}, documentId ${file.documentId})`) ?? [];
      const sentFile = message.attachment?.fileName ? [message.attachment.fileName] : [];
      const fileLine = [...receivedFiles, ...sentFile].length ? `\nAttachments: ${[...receivedFiles, ...sentFile].join(", ")}` : "";
      return `${sender}: ${(message.body || message.snippet || "").slice(0, 1800)}${fileLine}`;
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
    setProposedTasks([]);
    if (mode === "tasks") {
      try {
        const result = await httpsCallable(functions, "extractConversationTasks")({ conversationId: conversation.id });
        const data = result.data as { tasks?: ProposedTask[] };
        setProposedTasks((data.tasks ?? []).map((task) => ({ ...task, add_to_calendar: task.calendar_recommended && !!task.due_at })));
        if (!data.tasks?.length) setAiResult("No concrete tasks were found in this conversation.");
      } catch (e) {
        setAiError((e as Error).message || "Ivy could not extract tasks from this conversation.");
      } finally {
        setAiLoading(false);
      }
      return;
    }
    const instruction =
      mode === "brief"
        ? "Create a concise personalized AI brief for me. Use headings: Why this matters to me, What changed, My actions, Risks or deadlines, Suggested next step. Do not invent facts."
        : mode === "draft"
        ? "Draft a ready-to-send reply in the appropriate tone for this channel. Return only the reply text, with no commentary or markdown heading."
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

  const updateProposedTask = (index: number, patch: Partial<ProposedTask>) => {
    setProposedTasks((current) => current.map((task, taskIndex) => taskIndex === index ? { ...task, ...patch } : task));
  };

  const saveProposedTasks = async () => {
    if (!conversation || !user || savingTasks) return;
    const unsaved = proposedTasks.map((task, index) => ({ task, index })).filter(({ task }) => !task.saved && task.title.trim());
    if (!unsaved.length) return;
    setSavingTasks(true); setAiError(null);
    try {
      for (const { task, index } of unsaved) {
        const created = await httpsCallable(functions, "createTask")({
          title: task.title,
          description: task.description,
          priority: task.priority,
          dueAt: task.due_at,
          assigneeUid: user.uid,
          conversationId: conversation.id,
          sourceChannel: conversation.channel,
          aiGenerated: true,
          aiReasoning: `Extracted from conversation with ${Math.round(task.confidence * 100)}% confidence`,
        });
        const taskId = (created.data as { id?: string }).id;
        if (task.add_to_calendar && task.due_at && taskId) {
          const start = new Date(task.due_at);
          await httpsCallable(functions, "createCalendarEvent")({
            title: task.title,
            description: task.description,
            startAt: start.toISOString(),
            endAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
            taskId,
            conversationId: conversation.id,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
        }
        updateProposedTask(index, { saved: true });
      }
      setAiResult(`${unsaved.length} task${unsaved.length === 1 ? "" : "s"} added to Tasks.`);
    } catch (e) {
      setAiError((e as Error).message || "The tasks could not be saved.");
    } finally {
      setSavingTasks(false);
    }
  };

  const send = async () => {
    if (!reply.trim() || !conversation || !enterpriseId || sending) return;
    setSending(true);
    setError(null);
    setSendNotice(null);
    try {
      let uploadedAttachment: { storagePath: string; fileName: string; contentType: string; documentId: string; size: number; url: string } | undefined;
      if (attachment) {
        const prepared = await httpsCallable(functions, "prepareInboxAttachment")({
          enterpriseId,
          fileName: attachment.name,
          contentType: attachment.type || "application/octet-stream",
          size: attachment.size,
        });
        const upload = prepared.data as Omit<NonNullable<typeof uploadedAttachment>, "url"> & { uploadUrl: string };
        const uploaded = await fetch(upload.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": upload.contentType },
          body: attachment,
        });
        if (!uploaded.ok) throw new Error("The attachment upload failed. Please try again.");
        const finalized = await httpsCallable(functions, "finalizeInboxAttachment")({
          enterpriseId,
          documentId: upload.documentId,
          storagePath: upload.storagePath,
          fileName: upload.fileName,
          contentType: upload.contentType,
        });
        uploadedAttachment = finalized.data as typeof uploadedAttachment;
      }
      const nativeLimitMb = conversation.channel === "microsoft365" ? 3 : conversation.channel === "google-workspace" ? 20 : 25;
      const sendAsLink = uploadedAttachment && uploadedAttachment.size > nativeLimitMb * 1024 * 1024;
      const outgoingBody = sendAsLink && uploadedAttachment
        ? `${reply.trim()}\n\nAttachment: ${uploadedAttachment.fileName}\n${uploadedAttachment.url}`
        : reply.trim();
      const response = await httpsCallable(functions, "sendReply")({
        enterpriseId,
        conversationId: conversation.id,
        body: outgoingBody,
        cc: isEmail ? cc.trim() || null : null,
        attachment: sendAsLink ? null : uploadedAttachment,
      });
      const result = response.data as { status?: string };
      if (result.status === "pending") {
        setSendNotice("Reply queued for approval. It has not been sent yet.");
      } else if (result.status === "executed") {
        setSendNotice("Reply sent.");
      } else if (result.status === "off") {
        throw new Error("Workspace agents are Off, so the reply was not queued or sent.");
      } else if (result.status === "frozen" || result.status === "blocked" || result.status === "error") {
        throw new Error("The reply could not be queued or sent under the current workspace settings.");
      }
      updateReply("");
      setCc("");
      setAttachment(null);
      setComposerOpen(false);
      setComposerMinimized(false);
    } catch (e) {
      const msg = (e as { message?: string })?.message || "";
      setError(/access blocked|token|expired|OAuth/i.test(msg)
        ? "The connected channel rejected the send. Reconnect it with fresh credentials and try again."
        : msg || "Couldn't send. Please try again.");
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
              {aiMode === "tasks" && proposedTasks.length > 0 && (
                <div className="space-y-3 mt-3 max-h-80 overflow-y-auto pr-2">
                  {proposedTasks.map((task, index) => (
                    <div key={index} className={cn("bg-white border rounded-2xl p-3", task.saved ? "border-green-200 opacity-70" : "border-purple-100")}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-semibold uppercase text-purple-600">{task.saved ? "Saved" : `${Math.round(task.confidence * 100)}% confidence`}</span>
                        {task.calendar_recommended && <span className="text-[10px] bg-blue-50 text-blue-700 rounded-full px-2 py-1">Calendar suggested</span>}
                      </div>
                      <input disabled={task.saved} value={task.title} onChange={(event) => updateProposedTask(index, { title: event.target.value })} className="w-full text-sm font-semibold bg-transparent outline-none border-b border-gray-100 pb-2 disabled:opacity-70" />
                      <textarea disabled={task.saved} value={task.description} onChange={(event) => updateProposedTask(index, { description: event.target.value })} rows={2} className="w-full text-xs text-gray-600 bg-transparent resize-none outline-none mt-2 disabled:opacity-70" />
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <select disabled={task.saved} value={task.priority} onChange={(event) => updateProposedTask(index, { priority: event.target.value as ProposedTask["priority"] })} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select>
                        <input disabled={task.saved} type="datetime-local" value={task.due_at ? task.due_at.slice(0, 16) : ""} onChange={(event) => updateProposedTask(index, { due_at: event.target.value || null })} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5" />
                      </div>
                      {task.due_at && (
                        <label className="flex items-center gap-2 mt-2 text-xs text-gray-600">
                          <input type="checkbox" disabled={task.saved} checked={!!task.add_to_calendar} onChange={(event) => updateProposedTask(index, { add_to_calendar: event.target.checked })} />
                          Add a 30-minute block to my calendar
                        </label>
                      )}
                    </div>
                  ))}
                  <button disabled={savingTasks || proposedTasks.every((task) => task.saved)} onClick={saveProposedTasks} className="bg-black text-white text-xs font-semibold rounded-full px-4 py-2 disabled:opacity-40">{savingTasks ? "Adding tasks…" : "Add to Tasks"}</button>
                </div>
              )}
              {aiResult && <MarkdownText text={aiResult} className="text-sm text-gray-700 mt-2 max-h-64 overflow-y-auto pr-2" />}
              {aiMode === "draft" && aiResult && canReply && (
                <button
                  onClick={() => {
                    updateReply(aiResult);
                    setAiMode(null);
                    setComposerOpen(true);
                    setComposerMinimized(false);
                    requestAnimationFrame(() => replyRef.current?.focus());
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-full px-4 py-2"
                >
                  <Send2 size={14} variant="Linear" color="#ffffff" /> Use this reply
                </button>
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
                    {msg.from_email && !msg.from.toLowerCase().includes(msg.from_email.toLowerCase()) && (
                      <p className="text-xs text-gray-500">{msg.from_email}</p>
                    )}
                    <p className="text-xs text-gray-400">{msg.sender_type === "us" ? "Sent" : `to ${msg.to || "you"}`}</p>
                  </div>
                </div>
                <span className="text-xs text-gray-400 shrink-0">{fmtFull(msg.timestamp)}</span>
              </div>
              <MessageBody body={msg.body} snippet={msg.snippet} />
              {msg.cc && <p className="mt-2 text-xs text-gray-400"><span className="font-semibold text-gray-500">CC:</span> {msg.cc}</p>}
              {msg.attachment?.fileName && (
                <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-xl border border-purple-100 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-800">
                  <Paperclip2 size={15} variant="Linear" className="shrink-0" />
                  <span className="truncate">{msg.attachment.fileName}</span>
                </div>
              )}
              {!!msg.attachments?.length && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {msg.attachments.map((file) => (
                    <a
                      key={file.documentId}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex max-w-full items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 transition hover:border-blue-200 hover:bg-blue-100/70"
                    >
                      <Paperclip2 size={16} variant="Linear" className="shrink-0 text-blue-600" />
                      <span className="min-w-0">
                        <span className="block max-w-64 truncate text-xs font-semibold text-blue-900">{file.fileName}</span>
                        <span className="block text-[10px] text-blue-500">{file.contentType} · {file.size < 1024 * 1024 ? `${Math.ceil(file.size / 1024)} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`}</span>
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

      </div>

      {canReply && (
        <div className="border-t border-gray-100 bg-white px-6 py-4">
          {sendNotice && <p className="mb-2 rounded-xl border border-green-100 bg-green-50 px-3 py-2 text-xs text-green-700">{sendNotice}</p>}
          <button
            type="button"
            onClick={() => { setComposerOpen(true); setComposerMinimized(false); requestAnimationFrame(() => replyRef.current?.focus()); }}
            className="flex w-full items-center gap-3 rounded-2xl bg-gray-50 px-5 py-4 text-left text-sm text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <ArrowUp2 size={18} variant="Linear" />
            <span className="min-w-0 flex-1 truncate">{reply.trim() || `Reply to ${conversation.customer_ref}…`}</span>
            {reply.trim() && <span className="rounded-full bg-purple-100 px-2.5 py-1 text-[11px] font-semibold text-purple-700">Draft saved</span>}
          </button>
        </div>
      )}

      {canReply && composerOpen && (
        <section
          role="dialog"
          aria-label={`Reply to ${conversation.customer_ref}`}
          className={cn(
            "fixed z-[60] flex flex-col overflow-hidden border border-gray-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.28)] transition-all duration-200",
            composerMaximized
              ? "inset-4 rounded-3xl md:left-[250px]"
              : composerMinimized
              ? "bottom-0 right-4 h-14 w-[min(520px,calc(100vw-2rem))] rounded-t-2xl"
              : "bottom-0 right-4 h-[min(680px,calc(100vh-5rem))] w-[min(640px,calc(100vw-2rem))] rounded-t-3xl"
          )}
        >
          <header className="flex h-14 shrink-0 cursor-pointer items-center gap-3 bg-[#f2f6ff] px-5 text-[#112d60]" onClick={() => composerMinimized && setComposerMinimized(false)}>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-bold">Reply · {conversation.subject || "No subject"}</h2>
              {!composerMinimized && <p className="truncate text-[11px] text-blue-900/50">Draft saved locally · Ctrl/⌘ + Enter to send</p>}
            </div>
            <button type="button" onClick={(event) => { event.stopPropagation(); setComposerMinimized((value) => !value); }} className="rounded-full p-2 hover:bg-white/70" aria-label={composerMinimized ? "Restore composer" : "Minimize composer"}><Minus size={18} /></button>
            <button type="button" onClick={(event) => { event.stopPropagation(); setComposerMaximized((value) => !value); setComposerMinimized(false); }} className="rounded-full p-2 hover:bg-white/70" aria-label={composerMaximized ? "Restore composer size" : "Maximize composer"}><Maximize4 size={18} /></button>
            <button type="button" onClick={(event) => { event.stopPropagation(); setComposerOpen(false); }} className="rounded-full p-2 hover:bg-white/70" aria-label="Close composer"><CloseCircle size={20} /></button>
          </header>

          {!composerMinimized && (
            <>
              <div className="shrink-0 border-b border-gray-100 px-6">
                <div className="flex min-h-14 items-center border-b border-gray-100 text-sm"><span className="w-20 shrink-0 font-semibold text-gray-400">To</span><span className="min-w-0 flex-1 truncate text-gray-800">{conversation.customer_ref}</span></div>
                {isEmail && <div className="flex min-h-14 items-center border-b border-gray-100 text-sm"><span className="w-20 shrink-0 font-semibold text-gray-400">CC</span><input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Add comma-separated recipients" className="min-w-0 flex-1 bg-transparent text-gray-800 outline-none placeholder:text-gray-300" /></div>}
                <div className="flex min-h-14 items-center text-sm"><span className="w-20 shrink-0 font-semibold text-gray-400">Subject</span><span className="min-w-0 flex-1 truncate text-gray-800">{conversation.subject?.toLowerCase().startsWith("re:") ? conversation.subject : `Re: ${conversation.subject}`}</span></div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col px-6 pt-5">
                {error && <p className="mb-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
                <textarea
                  ref={replyRef}
                  value={reply}
                  onChange={(e) => updateReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
                  placeholder="Write your reply…"
                  className="min-h-[180px] flex-1 resize-none bg-transparent text-[15px] leading-7 text-gray-800 outline-none placeholder:text-gray-300"
                />
                {attachment && (
                  <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-purple-100 bg-purple-50 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2"><Paperclip2 size={17} className="shrink-0 text-purple-600" /><span className="truncate text-xs font-semibold text-purple-900">{attachment.name}</span><span className="shrink-0 text-[11px] text-purple-500">{attachment.size < 1024 * 1024 ? `${Math.ceil(attachment.size / 1024)} KB` : `${(attachment.size / 1024 / 1024).toFixed(1)} MB`}</span></div>
                    <button type="button" onClick={() => setAttachment(null)} className="rounded-full p-1 text-purple-500 hover:bg-purple-100 hover:text-red-600" aria-label="Remove attachment"><Trash size={15} /></button>
                  </div>
                )}
              </div>

              <footer className="flex shrink-0 items-center gap-2 border-t border-gray-100 px-6 py-4">
                <button type="button" onClick={send} disabled={!reply.trim() || sending} className="flex h-11 min-w-28 items-center justify-center gap-2 rounded-full bg-[#155bd7] px-6 text-sm font-semibold text-white transition hover:bg-[#0f4fca] disabled:cursor-not-allowed disabled:opacity-40">
                  {sending ? "Sending…" : <><span>Send</span><Send2 size={17} variant="Bold" color="#ffffff" /></>}
                </button>
                {isEmail && (
                  <>
                    <input ref={attachmentRef} type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0] ?? null; e.target.value = ""; if (!file) return; if (file.size > 100 * 1024 * 1024) { setError("Attachments must be 100 MB or smaller."); return; } setError(null); setAttachment(file); }} />
                    <button type="button" onClick={() => attachmentRef.current?.click()} className="rounded-full p-3 text-gray-500 hover:bg-gray-100 hover:text-purple-600" aria-label={attachment ? "Replace attachment" : "Add attachment"} title={attachment ? "Replace attachment" : "Add attachment"}><Paperclip2 size={20} /></button>
                  </>
                )}
                <span className="ml-auto text-[11px] text-gray-400">{reply.length.toLocaleString()} characters</span>
                <button type="button" onClick={() => { updateReply(""); setAttachment(null); setError(null); }} disabled={!reply && !attachment} className="rounded-full p-3 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label="Discard draft" title="Discard draft"><Trash size={19} /></button>
              </footer>
            </>
          )}
        </section>
      )}
    </div>
  );
}
