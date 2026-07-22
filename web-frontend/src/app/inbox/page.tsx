"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { DirectInbox, RefreshCircle } from "iconsax-react";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
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
  const [enterpriseId, setEnterpriseId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [syncing, setSyncing] = useState(false);

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
      const convs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Conversation, "id">) }));
      convs.sort((a, b) => (b.last_message_at?.toDate().getTime() ?? 0) - (a.last_message_at?.toDate().getTime() ?? 0));
      setConversations(convs);
      setSelectedId((cur) => cur ?? convs[0]?.id ?? null);
    });
  }, [enterpriseId]);

  // Live messages for selected conversation
  useEffect(() => {
    if (!selectedId) return;
    const q = query(collection(db, "messages"), where("conversation_id", "==", selectedId));
    return onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Message, "id">) }));
      msgs.sort((a, b) => (a.timestamp?.toDate().getTime() ?? 0) - (b.timestamp?.toDate().getTime() ?? 0));
      setMessages(msgs);
    });
  }, [selectedId]);

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

  const selectedConv = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex flex-col h-screen">
      <InboxTopBar />
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
            {conversations.length === 0 && (
              <div className="text-center text-sm text-gray-400 mt-10 px-6">
                {syncing ? "Syncing your mail…" : "No messages yet. Hit sync to pull your channels."}
              </div>
            )}
            {conversations.map((conv) => {
              const active = conv.id === selectedId;
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
                        <span className="text-sm font-semibold truncate">{conv.customer_ref}</span>
                        <span className="text-xs text-gray-400 shrink-0">{fmtTime(conv.last_message_at)}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-800 truncate mt-0.5">{conv.subject}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Reading pane */}
        <ReadingPane conversation={selectedConv} messages={messages} enterpriseId={enterpriseId} />
      </div>
    </div>
  );
}
