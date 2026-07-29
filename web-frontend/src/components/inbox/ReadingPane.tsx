"use client";

import { useEffect, useRef, useState } from "react";
import { DocumentText, Send2, Messages2, Clock, CloseCircle, Paperclip2, Trash } from "iconsax-react";
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
  const { user } = useAuth();
  const [reply, setReply] = useState("");
  const [cc, setCc] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
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

  useEffect(() => {
    setAiMode(null);
    setAiResult("");
    setAiQuestion("");
    setAiError(null);
    setProposedTasks([]);
    setReply("");
    setCc("");
    setAttachment(null);
    setError(null);
    setSendNotice(null);
  }, [conversation?.id]);

  const fileAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the attachment."));
    reader.readAsDataURL(file);
  });

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
      let uploadedAttachment: { storagePath: string; fileName: string; contentType: string; documentId?: string; size?: number } | undefined;
      if (attachment) {
        const upload = await httpsCallable(functions, "uploadInboxAttachment")({
          enterpriseId,
          fileName: attachment.name,
          contentType: attachment.type || "application/octet-stream",
          base64: await fileAsBase64(attachment),
        });
        uploadedAttachment = upload.data as typeof uploadedAttachment;
      }
      const response = await httpsCallable(functions, "sendReply")({
        enterpriseId,
        conversationId: conversation.id,
        body: reply.trim(),
        cc: isEmail ? cc.trim() || null : null,
        attachment: uploadedAttachment,
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
      setReply("");
      setCc("");
      setAttachment(null);
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
                    setReply(aiResult);
                    setAiMode(null);
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
                    <p className="text-xs text-gray-400">
                      {msg.sender_type === "us" ? "Sent" : "to you"}
                    </p>
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

      {/* Human-reviewed reply composer for every supported messaging channel. */}
      {canReply && (
      <div className="border-t border-gray-100 px-6 py-4 bg-white">
        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
        {sendNotice && <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2 mb-2">{sendNotice}</p>}
        {isEmail && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2">
            <span className="text-xs font-semibold text-gray-500">CC</span>
            <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="name@company.com (optional)" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </div>
        )}
        {attachment && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-purple-100 bg-purple-50 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <Paperclip2 size={16} variant="Linear" className="shrink-0 text-purple-600" />
              <span className="truncate text-xs font-semibold text-purple-800">{attachment.name}</span>
              <span className="shrink-0 text-[11px] text-purple-500">{(attachment.size / 1024).toFixed(attachment.size < 1024 * 1024 ? 0 : 1)} {attachment.size < 1024 * 1024 ? "KB" : "MB"}</span>
            </div>
            <button type="button" onClick={() => setAttachment(null)} className="rounded-full p-1 text-purple-500 hover:bg-purple-100 hover:text-red-600" aria-label="Remove attachment"><Trash size={15} variant="Linear" /></button>
          </div>
        )}
        <div className="flex items-end gap-3 bg-gray-50 rounded-2xl px-4 py-2.5">
          {isEmail && (
            <>
              <input ref={attachmentRef} type="file" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                if (!file) return;
                const max = conversation.channel === "microsoft365" ? 3 : 10;
                if (file.size > max * 1024 * 1024) {
                  setError(`Attachments for this channel must be ${max} MB or smaller.`);
                  return;
                }
                setError(null);
                setAttachment(file);
              }} />
              <button type="button" onClick={() => attachmentRef.current?.click()} className="mb-0.5 rounded-full p-2 text-gray-500 hover:bg-white hover:text-purple-600" aria-label={attachment ? "Replace attachment" : "Add attachment"} title={attachment ? "Replace attachment" : "Add attachment"}><Paperclip2 size={18} variant="Linear" /></button>
            </>
          )}
          <textarea
            ref={replyRef}
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
            {sending ? <span className="text-[10px] px-1">Sending</span> : <Send2 size={16} variant="Bold" color="#ffffff" />}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
