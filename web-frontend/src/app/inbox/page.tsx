"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { collection, query, where, onSnapshot, doc, getDoc, Timestamp } from "firebase/firestore";
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
  const { allowsRecord } = useAccess();
  const [enterpriseId, setEnterpriseId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [requestedConversation, setRequestedConversation] = useState<string | null>(null);
  const [readAt, setReadAt] = useState<Record<string, Timestamp>>({});

  // Restore the last inbox paint immediately; live Firestore listeners below
  // replace it with authoritative data as soon as they respond.
  useEffect(() => {
    if (!user) return;
    try {
      const cached = JSON.parse(localStorage.getItem(`ellipse_inbox_${user.uid}`) ?? "null") as {
        conversations?: (Omit<Conversation, "last_message_at"> & { last_message_at?: number })[];
        readAt?: Record<string, number>;
      } | null;
      if (cached?.conversations) {
        setConversations(cached.conversations.map((conversation) => ({
          ...conversation,
          last_message_at: conversation.last_message_at ? Timestamp.fromMillis(conversation.last_message_at) : undefined,
        })));
      }
      if (cached?.readAt) {
        setReadAt(Object.fromEntries(Object.entries(cached.readAt).map(([id, millis]) => [id, Timestamp.fromMillis(millis)])));
      }
    } catch {
      localStorage.removeItem(`ellipse_inbox_${user.uid}`);
    }
  }, [user]);

  const cacheInbox = useCallback((nextConversations: Conversation[], nextReadAt: Record<string, Timestamp>) => {
    if (!user) return;
    try {
      localStorage.setItem(`ellipse_inbox_${user.uid}`, JSON.stringify({
        conversations: nextConversations.map((conversation) => ({
          ...conversation,
          last_message_at: conversation.last_message_at?.toDate().getTime(),
        })),
        readAt: Object.fromEntries(Object.entries(nextReadAt).map(([id, timestamp]) => [id, timestamp.toDate().getTime()])),
      }));
    } catch {
      // Storage can be unavailable in private/restricted browser contexts.
    }
  }, [user]);

  useEffect(() => {
    if (conversations.length || Object.keys(readAt).length) cacheInbox(conversations, readAt);
  }, [conversations, readAt, cacheInbox]);

  useEffect(() => {
    setRequestedConversation(new URLSearchParams(window.location.search).get("conversation"));
  }, []);

  // Resolve enterprise
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      const id = snap.data()?.enterprise_id as string | undefined;
      if (id) setEnterpriseId(id);
    });
  }, [user]);

  // Live conversations
  useEffect(() => {
    if (!enterpriseId) return;
    const q = query(collection(db, "conversations"), where("enterprise_id", "==", enterpriseId));
    return onSnapshot(q, (snap) => {
      const convs = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Conversation, "id">) }))
        // Employees only see conversations from channels they've been granted.
        .filter((c) => allowsRecord(c.channel, c.connection_scope, c.owner_uid));
      convs.sort((a, b) => (b.last_message_at?.toDate().getTime() ?? 0) - (a.last_message_at?.toDate().getTime() ?? 0));
      setConversations(convs);
      setSelectedId((cur) => {
        if (requestedConversation && convs.some((c) => c.id === requestedConversation)) return requestedConversation;
        return cur && convs.some((c) => c.id === cur) ? cur : convs[0]?.id ?? null;
      });
    });
  }, [enterpriseId, allowsRecord, requestedConversation]);

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
  }, [enterpriseId, syncing]);

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

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredConversations.length === 0 && (
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
