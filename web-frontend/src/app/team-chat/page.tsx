"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { EmojiHappy, People, SearchNormal1, Send2, User } from "iconsax-react";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useAccess } from "@/lib/use-access";
import { cn } from "@/lib/utils";

type Member = {
  id: string;
  display_name?: string;
  email?: string;
  role?: "owner" | "admin" | "employee";
  status?: string;
};

type Chat = {
  id: string;
  enterprise_id: string;
  type: "group" | "direct";
  name?: string;
  pinned?: boolean;
  participant_uids?: string[];
  participant_names?: Record<string, string>;
  participant_emails?: Record<string, string>;
  last_message?: string;
  last_message_at?: Timestamp;
  last_sender_uid?: string;
};

type ChatMessage = {
  id: string;
  sender_uid: string;
  sender_name: string;
  text: string;
  created_at?: Timestamp;
};

const avatarClasses = ["bg-violet-100 text-violet-700", "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700", "bg-pink-100 text-pink-700"];
const CHAT_EMOJIS = [
  "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣",
  "😊", "😇", "🙂", "🙃", "😉", "😍", "🥰", "😘",
  "😋", "😎", "🤩", "🥳", "😏", "😢", "😭", "😤",
  "😡", "🤔", "🤗", "🤭", "🫡", "😴", "🙏", "👏",
  "👍", "👎", "👌", "✌️", "🤝", "💪", "🙌", "👀",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🤍", "💯",
  "🔥", "✨", "🎉", "🎊", "✅", "⭐", "🚀", "💡",
];

function memberName(member?: Member | null) {
  return member?.display_name || member?.email || "Member";
}

function avatarClass(value: string) {
  return avatarClasses[(value.charCodeAt(0) || 0) % avatarClasses.length];
}

function timeLabel(timestamp?: Timestamp) {
  if (!timestamp) return "";
  const date = timestamp.toDate();
  const today = date.toDateString() === new Date().toDateString();
  return today
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function TeamChatPage() {
  const { user } = useAuth();
  const { enterpriseId, loading: accessLoading } = useAccess();
  const [members, setMembers] = useState<Member[]>([]);
  const [groupChat, setGroupChat] = useState<Chat | null>(null);
  const [directChats, setDirectChats] = useState<Chat[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [readAt, setReadAt] = useState<Record<string, Timestamp>>({});
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingChat, setPendingChat] = useState<Chat | null>(null);
  const [pendingChatReady, setPendingChatReady] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("chat");
    if (requested) setSelectedId(requested);
  }, []);

  useEffect(() => {
    const closePicker = (event: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(event.target as Node)) setEmojiOpen(false);
    };
    document.addEventListener("mousedown", closePicker);
    return () => document.removeEventListener("mousedown", closePicker);
  }, []);

  useEffect(() => {
    if (!user || !enterpriseId) return;
    const membersQuery = query(collection(db, "users"), where("enterprise_id", "==", enterpriseId));
    return onSnapshot(membersQuery, (snapshot) => {
      setMembers(snapshot.docs
        .map((item) => ({ id: item.id, ...(item.data() as Omit<Member, "id">) }))
        .filter((member) => (member.status ?? "active") === "active")
        .sort((a, b) => memberName(a).localeCompare(memberName(b))));
    });
  }, [user, enterpriseId]);

  useEffect(() => {
    if (!user || !enterpriseId) return;
    let unsubscribeGroup: (() => void) | undefined;
    httpsCallable(functions, "ensureTeamChat")({}).then((result) => {
      const chatId = (result.data as { chatId: string }).chatId;
      unsubscribeGroup = onSnapshot(doc(db, "internal_chats", chatId), (snapshot) => {
        if (!snapshot.exists()) return;
        const chat = { id: snapshot.id, ...(snapshot.data() as Omit<Chat, "id">) };
        setGroupChat(chat);
        setSelectedId((current) => current || chat.id);
      });
    }).catch((cause) => setError((cause as Error).message || "Team chat could not be opened."));
    return () => unsubscribeGroup?.();
  }, [user, enterpriseId]);

  useEffect(() => {
    if (!user || !enterpriseId) return;
    const chatsQuery = query(collection(db, "internal_chats"), where("participant_uids", "array-contains", user.uid));
    return onSnapshot(chatsQuery, (snapshot) => {
      const chats = snapshot.docs
        .map((item) => ({ id: item.id, ...(item.data() as Omit<Chat, "id">) }))
        .filter((chat) => chat.enterprise_id === enterpriseId && chat.type === "direct")
        .sort((a, b) => (b.last_message_at?.toMillis() ?? 0) - (a.last_message_at?.toMillis() ?? 0));
      setDirectChats(chats);
    });
  }, [user, enterpriseId]);

  useEffect(() => {
    if (!user || !enterpriseId) return;
    const readsQuery = query(collection(db, "internal_chat_reads"), where("user_id", "==", user.uid));
    return onSnapshot(readsQuery, (snapshot) => {
      const next: Record<string, Timestamp> = {};
      snapshot.docs.forEach((item) => {
        const data = item.data();
        if (data.enterprise_id === enterpriseId && data.chat_id && data.read_at) next[data.chat_id] = data.read_at;
      });
      setReadAt(next);
    });
  }, [user, enterpriseId]);

  useEffect(() => {
    if (pendingChat && directChats.some((chat) => chat.id === pendingChat.id)) {
      setPendingChat(null);
      setPendingChatReady(false);
    }
  }, [directChats, pendingChat]);

  const selectedIsReady = selectedId === groupChat?.id
    || directChats.some((chat) => chat.id === selectedId)
    || (pendingChat?.id === selectedId && pendingChatReady);

  useEffect(() => {
    setMessages([]);
    if (!selectedId || !user || !selectedIsReady) return;
    const messagesQuery = query(collection(db, "internal_chats", selectedId, "messages"), orderBy("created_at", "asc"));
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      setMessages(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<ChatMessage, "id">) })));
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    }, (cause) => setError(cause.message));
    setReadAt((current) => ({ ...current, [selectedId]: Timestamp.now() }));
    httpsCallable(functions, "markInternalChatRead")({ chatId: selectedId }).catch(() => undefined);
    return unsubscribe;
  }, [selectedId, user, selectedIsReady]);

  const selectedChat = selectedId === groupChat?.id
    ? groupChat
    : directChats.find((chat) => chat.id === selectedId) ?? (pendingChat?.id === selectedId ? pendingChat : null);
  const counterpartUid = selectedChat?.type === "direct"
    ? selectedChat.participant_uids?.find((uid) => uid !== user?.uid)
    : undefined;
  const counterpart = members.find((member) => member.id === counterpartUid);
  const selectedName = selectedChat?.type === "group" ? selectedChat.name || "Team Chat" : memberName(counterpart);

  const visibleMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return members.filter((member) => member.id !== user?.uid && (!term || memberName(member).toLowerCase().includes(term) || member.email?.toLowerCase().includes(term)));
  }, [members, search, user]);

  const chatForMember = (uid: string) => directChats.find((chat) => chat.participant_uids?.includes(uid));
  const isUnread = (chat: Chat) => (chat.last_message_at?.toMillis() ?? 0) > (readAt[chat.id]?.toMillis() ?? 0) && chat.last_sender_uid !== user?.uid;

  const openMember = async (member: Member) => {
    const existing = chatForMember(member.id);
    if (existing) return setSelectedId(existing.id);
    if (!user || !enterpriseId) return;
    const chatId = `direct_${enterpriseId}_${[user.uid, member.id].sort().join("_")}`;
    setPendingChat({
      id: chatId,
      enterprise_id: enterpriseId,
      type: "direct",
      participant_uids: [user.uid, member.id],
      participant_names: { [user.uid]: user.displayName || user.email || "You", [member.id]: memberName(member) },
      participant_emails: { [user.uid]: user.email || "", [member.id]: member.email || "" },
    });
    setPendingChatReady(false);
    setSelectedId(chatId);
    setError(null);
    try {
      await httpsCallable(functions, "startInternalChat")({ targetUid: member.id });
      setPendingChatReady(true);
    } catch (cause) {
      setPendingChat(null);
      setPendingChatReady(false);
      setSelectedId(null);
      setError((cause as Error).message || "The direct chat could not be opened.");
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!selectedId || !text || sending || !selectedIsReady) return;
    setSending(true); setError(null); setDraft(""); setEmojiOpen(false);
    try {
      await httpsCallable(functions, "sendInternalMessage")({ chatId: selectedId, text });
    } catch (cause) {
      setDraft(text);
      setError((cause as Error).message || "Message could not be sent.");
    } finally {
      setSending(false);
    }
  };

  const insertEmoji = (emoji: string) => {
    const input = draftRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? start;
    setDraft(`${draft.slice(0, start)}${emoji}${draft.slice(end)}`);
    requestAnimationFrame(() => {
      input?.focus();
      const cursor = start + emoji.length;
      input?.setSelectionRange(cursor, cursor);
    });
  };

  if (accessLoading) return <div className="flex h-screen items-center justify-center text-sm text-gray-400">Opening Team Chat…</div>;

  return (
    <main className="flex h-screen min-w-0 bg-[#f7f7f8]">
      <section className="flex min-w-0 flex-1 overflow-hidden bg-white">
        <aside className="flex w-[330px] shrink-0 flex-col border-r border-gray-100">
          <div className="p-5 pb-3">
            <h1 className="text-2xl font-bold tracking-tight">Team Chat</h1>
            <p className="mt-1 text-xs text-gray-400">Private conversations inside your organization.</p>
            <div className="relative mt-4">
              <SearchNormal1 size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search members" className="w-full rounded-full bg-gray-50 py-2.5 pl-10 pr-4 text-sm outline-none ring-purple-100 focus:ring-4" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-4">
            <p className="px-3 pb-2 pt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Pinned</p>
            {groupChat && <ChatRow chat={groupChat} active={selectedId === groupChat.id} unread={isUnread(groupChat)} name={groupChat.name || "Team Chat"} subtitle={groupChat.last_message || `${members.length} organization members`} onClick={() => setSelectedId(groupChat.id)} group />}
            <p className="px-3 pb-2 pt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">People</p>
            <div className="space-y-1">
              {visibleMembers.map((member) => {
                const chat = chatForMember(member.id);
                const active = chat?.id === selectedId || Boolean(!chat && pendingChat?.participant_uids?.includes(member.id) && pendingChat.id === selectedId);
                return <ChatRow key={member.id} chat={chat} active={active} unread={chat ? isUnread(chat) : false} name={memberName(member)} subtitle={chat?.last_message || member.email || "Start a conversation"} onClick={() => openMember(member)} />;
              })}
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-[#fafafd]">
          {selectedChat ? <>
            <header className="flex h-[78px] items-center justify-between border-b border-gray-100 bg-white px-6">
              <div className="flex items-center gap-3">
                <Avatar name={selectedName} group={selectedChat.type === "group"} />
                <div><p className="font-bold text-gray-900">{selectedName}</p><p className="text-xs text-emerald-600">{selectedChat.type === "group" ? `${members.length} members` : "Organization member"}</p></div>
              </div>
              {selectedChat.type === "group" && <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700"><People size={14} /> Everyone</span>}
            </header>
            <div className="flex-1 overflow-y-auto px-7 py-6">
              {!messages.length && <div className="flex h-full flex-col items-center justify-center text-center"><Avatar name={selectedName} group={selectedChat.type === "group"} large /><h2 className="mt-4 text-lg font-bold">Start the conversation</h2><p className="mt-1 max-w-xs text-sm text-gray-400">Messages here are visible only to the relevant organization members.</p></div>}
              <div className="space-y-4">
                {messages.map((message, index) => {
                  const mine = message.sender_uid === user?.uid;
                  const showSender = !mine && (index === 0 || messages[index - 1]?.sender_uid !== message.sender_uid);
                  return <div key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}><div className="max-w-[72%]">{showSender && <p className="mb-1 ml-2 text-[11px] font-semibold text-gray-500">{message.sender_name}</p>}<div className={cn("whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm", mine ? "rounded-br-md bg-black text-white" : "rounded-bl-md border border-gray-100 bg-white text-gray-700")}>{message.text}</div><p className={cn("mt-1 text-[10px] text-gray-400", mine ? "text-right" : "ml-2")}>{timeLabel(message.created_at)}</p></div></div>;
                })}
                <div ref={bottomRef} />
              </div>
            </div>
            <div className="border-t border-gray-100 bg-white p-4">
              {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
              <div className="relative flex items-end gap-2 rounded-2xl bg-gray-50 px-3 py-2.5 ring-purple-100 focus-within:ring-4">
                <div ref={emojiRef} className="relative shrink-0">
                  {emojiOpen && (
                    <div className="absolute bottom-12 left-0 z-30 w-[320px] rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_16px_45px_rgba(17,24,39,0.18)]">
                      <p className="mb-2 px-1 text-xs font-semibold text-gray-500">Emojis</p>
                      <div className="grid max-h-52 grid-cols-8 gap-1 overflow-y-auto">
                        {CHAT_EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="flex h-8 w-8 items-center justify-center rounded-lg text-xl hover:bg-gray-100" aria-label={`Insert ${emoji}`}>{emoji}</button>)}
                      </div>
                    </div>
                  )}
                  <button type="button" onClick={() => setEmojiOpen((open) => !open)} className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-white hover:text-violet-600" aria-label="Choose an emoji" aria-expanded={emojiOpen}><EmojiHappy size={21} variant="Linear" /></button>
                </div>
                <textarea ref={draftRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setEmojiOpen(false); if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} rows={1} maxLength={5000} placeholder={`Message ${selectedName}`} className="max-h-32 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none" />
                <button type="button" onClick={send} disabled={!draft.trim() || sending || !selectedIsReady} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"><Send2 size={18} variant="Bold" /></button>
              </div>
            </div>
          </> : <div className="flex h-full items-center justify-center text-sm text-gray-400">Choose a member to start chatting.</div>}
        </section>
      </section>
    </main>
  );
}

function Avatar({ name, group, large, small }: { name: string; group?: boolean; large?: boolean; small?: boolean }) {
  const size = large ? "h-16 w-16 text-lg" : small ? "h-8 w-8 text-[10px]" : "h-10 w-10 text-xs";
  const iconSize = large ? 29 : small ? 17 : 21;
  return <span className={cn("flex shrink-0 items-center justify-center rounded-full font-bold", size, group ? "bg-violet-600 text-white" : avatarClass(name))}>{group ? <People size={large ? 27 : 18} variant="Bold" /> : <User size={iconSize} variant="Bold" />}</span>;
}

function ChatRow({ chat, active, unread, name, subtitle, onClick, group }: { chat?: Chat; active: boolean; unread: boolean; name: string; subtitle: string; onClick: () => void; group?: boolean }) {
  return <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition", active ? "border-violet-200 bg-violet-50" : "border-transparent hover:bg-gray-50")}><Avatar name={name} group={group} /><span className="min-w-0 flex-1"><span className={cn("block truncate text-sm", unread ? "font-bold text-gray-950" : "font-semibold text-gray-700")}>{name}</span><span className={cn("mt-0.5 block truncate text-xs", unread ? "font-medium text-gray-700" : "text-gray-400")}>{subtitle}</span></span><span className="flex shrink-0 flex-col items-end gap-2">{chat?.last_message_at && <span className="text-[10px] text-gray-400">{timeLabel(chat.last_message_at)}</span>}{unread && <span className="h-2 w-2 rounded-full bg-violet-600" />}</span></button>;
}
