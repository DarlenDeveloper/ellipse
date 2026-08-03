"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { collection, query, where, onSnapshot, Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { DirectInbox, RefreshCircle } from "iconsax-react";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useAccess } from "@/lib/use-access";
import { InboxTopBar } from "@/components/inbox/InboxTopBar";
import { ReadingPane } from "@/components/inbox/ReadingPane";
import { cn } from "@/lib/utils";

// Channel → display name + logo. logo null falls back to a mailbox icon.
const CHANNEL_META: Record<string, { name: string; logo: string | null }> = {
  "google-workspace": { name: "Gmail", logo: "/logos/gmail.png" },
  smtp: { name: "SMTP / IMAP", logo: "/logos/smtp.png" },
  whatsapp: { name: "WhatsApp", logo: "/logos/whatsapp.png" },
  microsoft365: { name: "Outlook", logo: "/logos/outlook.png" },
};

function channelInfo(channel?: string) {
  return CHANNEL_META[channel ?? ""] ?? { name: channel ?? "Unknown", logo: null };
}

type Conversation = {
  id: string;
  subject: string;
  customer_ref: string;
  channel: string;
  last_message_at?: { toDate: () => Date };
  connection_scope?: string;
  owner_uid?: string;
};

type Message = {
  id: string;
  from: string;
  from_email: string;
  subject: string;
  snippet: string;
  body: string;
  sender_type: "us" | "customer";
  timestamp?: { toDate: () => Date };
};

type InboxPeriod = "today" | "week" | "month" | "all";
type InboxCursor = { lastMessageAt: number; id: string };
const PERIODS: { id: InboxPeriod; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "all", label: "All time" },
];

function fmtTime(ts?: { toDate: () => Date }): string {
  if (!ts) return "";
  const d = ts.toDate();
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function InboxPage() {
  const { user } = useAuth();
  const { enterpriseId } = useAccess();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [period, setPeriod] = useState<InboxPeriod>("today");
  const [page, setPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<Array<InboxCursor | null>>([null]);
  const [nextCursor, setNextCursor] = useState<InboxCursor | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [requestedConversation, setRequestedConversation] = useState<string | null>(null);
  const [readAt, setReadAt] = useState<Record<string, Timestamp>>({});

  useEffect(() => {
    setRequestedConversation(new URLSearchParams(window.location.search).get("conversation"));
  }, []);

  // Server-paginated, access-scoped conversations (12 per page).
  useEffect(() => {
    if (!enterpriseId || !user) return;
    const cursor = pageCursors[page - 1] ?? null;
    const cacheKey = `ellipse_inbox_${user.uid}_${period}_${page}_${cursor?.id ?? "start"}`;
    let active = true;
    setConversationsLoading(true);
    const applyPage = (payload: { conversations: Array<Omit<Conversation, "last_message_at"> & { last_message_at?: number | null }>; hasNext: boolean; nextCursor?: InboxCursor | null }) => {
      if (!active) return;
      const convs = payload.conversations.map((conversation) => ({
        ...conversation,
        last_message_at: conversation.last_message_at ? Timestamp.fromMillis(conversation.last_message_at) : undefined,
      }));
      setConversations(convs);
      setHasNext(payload.hasNext);
      setNextCursor(payload.nextCursor ?? null);
      setSelectedId((current) => {
        if (requestedConversation && convs.some((conversation) => conversation.id === requestedConversation)) return requestedConversation;
        return current && convs.some((conversation) => conversation.id === current) ? current : convs[0]?.id ?? null;
      });
      setConversationsLoading(false);
    };
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) ?? "null") as { savedAt: number; payload: Parameters<typeof applyPage>[0] } | null;
      if (cached && Date.now() - cached.savedAt < 2 * 60_000 && refreshNonce === 0) {
        applyPage(cached.payload);
        return () => { active = false; };
      }
    } catch { localStorage.removeItem(cacheKey); }
    httpsCallable(functions, "listInboxConversations")({ period, cursor }).then((result) => {
      const payload = result.data as Parameters<typeof applyPage>[0];
      applyPage(payload);
      try { localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), payload })); } catch { /* storage unavailable */ }
      if (refreshNonce > 0) setRefreshNonce(0);
    }).catch((error) => {
      console.error("Conversation page failed", error);
      if (active) { setConversations([]); setHasNext(false); setConversationsLoading(false); }
    });
    return () => { active = false; };
  }, [enterpriseId, page, pageCursors, period, refreshNonce, requestedConversation, user]);

  // Read receipts are private to the signed-in user.
  useEffect(() => {
    if (!user || !enterpriseId) return;
    const q = query(collection(db, "conversation_reads"), where("user_id", "==", user.uid));
    return onSnapshot(q, (snap) => {
      const next: Record<string, Timestamp> = {};
      snap.docs.forEach((item) => {
        const data = item.data();
        if (data.enterprise_id === enterpriseId && data.conversation_id && data.read_at) {
          next[data.conversation_id as string] = data.read_at as Timestamp;
        }
      });
      setReadAt((current) => ({ ...current, ...next }));
    });
  }, [user, enterpriseId]);

  // Opening a conversation marks its current latest message as read.
  useEffect(() => {
    if (!selectedId || !user) return;
    setReadAt((current) => ({ ...current, [selectedId]: Timestamp.now() }));
    httpsCallable(functions, "markConversationRead")({ conversationId: selectedId }).catch((error) => {
      console.error("Could not mark conversation as read", error);
    });
  }, [selectedId, user]);

  // Live messages for selected conversation
  useEffect(() => {
    setMessagesError(null);
    if (!selectedId || !enterpriseId) return;
    try {
      const cached = JSON.parse(localStorage.getItem(`ellipse_messages_${user?.uid}_${selectedId}`) ?? "[]") as
        (Omit<Message, "timestamp"> & { timestamp?: number })[];
      setMessages(cached.map((message) => ({
        ...message,
        timestamp: message.timestamp ? Timestamp.fromMillis(message.timestamp) : undefined,
      })));
    } catch {
      setMessages([]);
    }
    setMessagesLoading(true);
    const q = query(
      collection(db, "messages"),
      where("enterprise_id", "==", enterpriseId),
      where("conversation_id", "==", selectedId)
    );
    return onSnapshot(
      q,
      (snap) => {
        const msgs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Message, "id">) }));
        msgs.sort((a, b) => (a.timestamp?.toDate().getTime() ?? 0) - (b.timestamp?.toDate().getTime() ?? 0));
        setMessages(msgs);
        try {
          localStorage.setItem(`ellipse_messages_${user?.uid}_${selectedId}`, JSON.stringify(msgs.map((message) => ({
            ...message,
            timestamp: message.timestamp?.toDate().getTime(),
          }))));
        } catch {
          // Ignore unavailable browser storage.
        }
        setMessagesLoading(false);
      },
      (error) => {
        console.error("Message listener failed", error);
        setMessagesError("This email could not be loaded. Try refreshing the inbox.");
        setMessagesLoading(false);
      }
    );
  }, [selectedId, enterpriseId, user]);

  const sync = useCallback(async () => {
    if (!enterpriseId || syncing) return;
    setSyncing(true);
    // Pull every connected channel; ignore ones that aren't connected.
    await Promise.allSettled([
      httpsCallable(functions, "syncGmail")({ enterpriseId }),
      httpsCallable(functions, "syncSmtp")({ enterpriseId }),
      httpsCallable(functions, "syncOutlook")({ enterpriseId }),
    ]);
    setSyncing(false);
    setRefreshNonce((value) => value + 1);
  }, [enterpriseId, syncing]);

  const changePeriod = (next: InboxPeriod) => {
    setPeriod(next);
    setPage(1);
    setPageCursors([null]);
    setNextCursor(null);
    setHasNext(false);
  };

  const nextPage = () => {
    if (!hasNext || !nextCursor || conversationsLoading) return;
    setPageCursors((current) => {
      const next = [...current];
      next[page] = nextCursor;
      return next;
    });
    setPage((current) => current + 1);
  };

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((conversation) => {
      const channel = channelInfo(conversation.channel);
      return [
        conversation.subject,
        conversation.customer_ref,
        conversation.channel,
        channel.name,
      ].some((value) => value?.toLowerCase().includes(term));
    });
  }, [conversations, search]);

  useEffect(() => {
    setSelectedId((current) =>
      current && filteredConversations.some((conversation) => conversation.id === current)
        ? current
        : filteredConversations[0]?.id ?? null
    );
  }, [filteredConversations]);

  const selectedConv = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex flex-col h-screen">
      <InboxTopBar value={search} onChange={setSearch} />
      <div className="flex flex-1 min-h-0">
        {/* Conversation list */}
        <div className="w-[380px] shrink-0 border-r border-gray-100 flex flex-col bg-white">
          <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
            <h2 className="text-lg font-bold tracking-tight">Primary</h2>
            <button
              onClick={sync}
              disabled={syncing}
              title="Sync all channels"
              className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
            >
              <RefreshCircle size={18} variant="Linear" className={syncing ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="flex gap-1 overflow-x-auto border-b border-gray-100 px-3 py-3">
            {PERIODS.map((item) => (
              <button key={item.id} type="button" onClick={() => changePeriod(item.id)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition", period === item.id ? "bg-black text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100")}>{item.label}</button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {conversationsLoading && conversations.length === 0 && (
              <div className="space-y-2" aria-label="Loading conversations">
                {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="flex animate-pulse items-center gap-3 rounded-2xl p-4"><span className="h-9 w-9 rounded-full bg-gray-100" /><span className="flex-1"><span className="block h-4 w-2/3 rounded bg-gray-100" /><span className="mt-2 block h-3 w-5/6 rounded bg-gray-100" /></span></div>)}
              </div>
            )}
            {!conversationsLoading && filteredConversations.length === 0 && (
              <div className="text-center text-sm text-gray-400 mt-10 px-6">
                {syncing
                  ? "Syncing your mail…"
                  : search.trim()
                  ? `No conversations match “${search.trim()}”.`
                  : "No messages yet. Hit sync to pull your channels."}
              </div>
            )}
            {filteredConversations.map((conv) => {
              const active = conv.id === selectedId;
              const lastMessageMs = conv.last_message_at?.toDate().getTime() ?? 0;
              const readMs = readAt[conv.id]?.toDate().getTime() ?? 0;
              const unread = readMs < lastMessageMs;
              const ch = channelInfo(conv.channel);
              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  className={cn(
                    "w-full text-left rounded-2xl p-4 transition-colors border",
                    active ? "bg-blue-50 border-blue-200" : "bg-white border-transparent hover:bg-gray-50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 flex items-center justify-center shrink-0">
                      {ch.logo ? (
                        <Image src={ch.logo} alt={ch.name} width={32} height={32} className="w-8 h-8 object-contain" />
                      ) : (
                        <DirectInbox size={26} variant="Bold" color="#475569" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("text-sm truncate", unread ? "font-bold text-gray-950" : "font-normal text-gray-600")}>{conv.customer_ref}</span>
                        <span className="text-xs text-gray-400 shrink-0">{fmtTime(conv.last_message_at)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className={cn("text-sm truncate mt-0.5", unread ? "font-semibold text-gray-900" : "font-normal text-gray-500")}>{conv.subject}</p>
                        {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1 || conversationsLoading} className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 disabled:opacity-35">Previous</button>
            <span className="text-xs font-medium text-gray-400">Page {page}</span>
            <button type="button" onClick={nextPage} disabled={!hasNext || conversationsLoading} className="rounded-full bg-black px-4 py-1.5 text-xs font-medium text-white disabled:opacity-35">Next</button>
          </div>
        </div>

        {/* Reading pane */}
        <ReadingPane
          conversation={selectedConv}
          messages={messages}
          enterpriseId={enterpriseId}
          messagesLoading={messagesLoading}
          messagesError={messagesError}
        />
      </div>
    </div>
  );
}
