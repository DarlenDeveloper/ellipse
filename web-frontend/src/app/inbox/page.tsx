"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { RotateLeft, Sms, RefreshCircle } from "iconsax-react";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { InboxTopBar } from "@/components/inbox/InboxTopBar";
import { ReadingPane } from "@/components/inbox/ReadingPane";
import { cn } from "@/lib/utils";

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

const avatarColors = [
  "bg-emerald-100 text-emerald-700",
  "bg-purple-200 text-purple-700",
  "bg-amber-100 text-amber-700",
  "bg-pink-100 text-pink-700",
  "bg-blue-100 text-blue-700",
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
    try {
      const fn = httpsCallable(functions, "syncGmail");
      await fn({ enterpriseId });
    } finally {
      setSyncing(false);
    }
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
              title="Sync Gmail"
              className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
            >
              <RefreshCircle size={18} variant="Linear" className={syncing ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {conversations.length === 0 && (
              <div className="text-center text-sm text-gray-400 mt-10 px-6">
                {syncing ? "Syncing your mail…" : "No messages yet. Hit sync to pull your Gmail."}
              </div>
            )}
            {conversations.map((conv, i) => {
              const active = conv.id === selectedId;
              const initial = (conv.customer_ref?.[0] ?? "?").toUpperCase();
              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  className={cn(
                    "w-full text-left rounded-2xl p-4 transition-colors border",
                    active ? "bg-purple-50 border-purple-200" : "bg-white border-transparent hover:bg-gray-50"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0", avatarColors[i % avatarColors.length])}>
                      {initial}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold truncate">{conv.customer_ref}</span>
                        <span className="text-xs text-gray-400 shrink-0">{fmtTime(conv.last_message_at)}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-800 truncate mt-0.5">{conv.subject}</p>
                      <p className="text-xs text-gray-400 truncate mt-0.5 flex items-center gap-1">
                        <Sms size={12} variant="Bold" /> Gmail
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Reading pane */}
        <ReadingPane conversation={selectedConv} messages={messages} />
      </div>
    </div>
  );
}
