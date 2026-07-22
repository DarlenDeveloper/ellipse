"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Add,
  ArrowUp,
  ArrowDown2,
  Paperclip2,
  Flash,
  DocumentText1,
  SearchNormal1,
  TickCircle,
  Clock,
} from "iconsax-react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useEnterpriseId } from "@/lib/use-enterprise";
import { IvyOrb } from "@/components/ivy/IvyOrb";
import { cn } from "@/lib/utils";

type Msg = { role: "ivy" | "user"; text: string };

type AgentOption = { id: string; name: string; logo: string | null };

const CONNECTION_AGENTS: Record<string, { name: string; logo: string }> = {
  "google-workspace": { name: "Gmail Agent", logo: "/logos/gmail.png" },
  zoho: { name: "Zoho Agent", logo: "/logos/zoho.png" },
  smtp: { name: "SMTP Agent", logo: "/logos/smtp.png" },
  website: { name: "Website Agent", logo: "/logos/web.png" },
  whatsapp: { name: "WhatsApp Agent", logo: "/logos/whatsapp.png" },
  microsoft365: { name: "Microsoft 365 Agent", logo: "/logos/microsoft.png" },
};

const CHIPS = [
  { icon: Flash, label: "This week across all channels" },
  { icon: DocumentText1, label: "Leads to follow up" },
  { icon: SearchNormal1, label: "How are sales trending?" },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function IvyPage() {
  const { user } = useAuth();
  const { enterpriseId } = useEnterpriseId();

  const [connTypes, setConnTypes] = useState<string[]>([]);
  const [agentId, setAgentId] = useState("ivy");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enterpriseId) return;
    return onSnapshot(
      query(collection(db, "connections"), where("enterprise_id", "==", enterpriseId)),
      (snap) => {
        setConnTypes(
          snap.docs
            .map((d) => d.data() as { type: string; status: string })
            .filter((c) => c.status === "active" && CONNECTION_AGENTS[c.type])
            .map((c) => c.type)
        );
      }
    );
  }, [enterpriseId]);

  const agents: AgentOption[] = useMemo(
    () => [
      { id: "ivy", name: "Ivy — all agents", logo: null },
      ...connTypes.map((t) => ({ id: t, name: CONNECTION_AGENTS[t].name, logo: CONNECTION_AGENTS[t].logo })),
    ],
    [connTypes]
  );
  const active = agents.find((a) => a.id === agentId) ?? agents[0];

  const firstName = (user?.displayName || user?.email?.split("@")[0] || "there").split(" ")[0];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = (text?: string) => {
    const q = (text ?? input).trim();
    if (!q) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      const who = agentId === "ivy" ? "I" : `The ${active.name}`;
      setMessages((m) => [
        ...m,
        {
          role: "ivy",
          text: `${who} will be able to answer that once Ivy is fully online — pulling live from ${
            agentId === "ivy" ? "every connected agent, your reports and CRM" : active.name
          }.`,
        },
      ]);
    }, 900);
  };

  const newChat = () => {
    setMessages([]);
    setInput("");
  };

  const empty = messages.length === 0;

  return (
    <div className="flex flex-col h-screen bg-[#f7f7f8]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
        {/* History */}
        <div className="relative">
          <button
            onClick={() => setHistoryOpen((o) => !o)}
            title="Chat history"
            className="w-10 h-10 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.05)] flex items-center justify-center hover:shadow-md transition-shadow"
          >
            <Clock size={19} variant="Linear" color="#6b7280" />
          </button>
          {historyOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setHistoryOpen(false)} />
              <div className="absolute left-0 mt-2 w-64 bg-white rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.15)] border border-gray-100 p-1.5 z-20">
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-300">
                  Recent chats
                </p>
                <p className="px-3 py-6 text-sm text-gray-400 text-center">No previous chats yet.</p>
              </div>
            </>
          )}
        </div>

        {/* Agent selector */}
        <div className="relative">
          <button
            onClick={() => setPickerOpen((o) => !o)}
            className="flex items-center gap-2.5 bg-white rounded-full pl-2 pr-3 py-1.5 shadow-[0_2px_10px_rgba(0,0,0,0.05)] hover:shadow-md transition-shadow"
          >
            <span className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-gray-50">
              {active.logo ? (
                <Image src={active.logo} alt="" width={20} height={20} className="object-contain" />
              ) : (
                <IvyOrb size={26} />
              )}
            </span>
            <span className="text-sm font-semibold">{active.name}</span>
            <ArrowDown2 size={16} variant="Linear" color="#9ca3af" />
          </button>

          {pickerOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
              <div className="absolute left-0 mt-2 w-64 bg-white rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.15)] border border-gray-100 p-1.5 z-20">
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-300">
                  Talk to
                </p>
                {agents.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setAgentId(a.id);
                      setPickerOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors",
                      a.id === agentId ? "bg-gray-50" : "hover:bg-gray-50"
                    )}
                  >
                    <span className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-gray-50 shrink-0">
                      {a.logo ? (
                        <Image src={a.logo} alt="" width={22} height={22} className="object-contain" />
                      ) : (
                        <IvyOrb size={30} />
                      )}
                    </span>
                    <span className="flex-1 text-sm font-medium">{a.name}</span>
                    {a.id === agentId && <TickCircle size={18} variant="Bold" color="#3884ff" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        </div>

        <button
          onClick={newChat}
          className="flex items-center gap-2 bg-black text-white text-sm font-semibold rounded-full px-4 py-2 hover:bg-gray-800"
        >
          <Add size={18} variant="Linear" color="#ffffff" />
          New Chat
        </button>
      </div>

      {/* Body */}
      {empty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-16">
          <div style={{ animation: "ivy-rotate 24s linear infinite" }}>
            <IvyOrb size={92} active={thinking} />
          </div>
          <h1 className="text-3xl font-bold mt-6 text-center">
            {greeting()}, {firstName}
          </h1>
          <p className="text-3xl font-bold text-center">
            How can I <span className="text-blue-500">assist you today?</span>
          </p>

          <div className="w-full max-w-2xl mt-10">
            <Composer
              input={input}
              setInput={setInput}
              onSend={() => send()}
              agentName={active.name}
            />
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              {CHIPS.map((c) => (
                <button
                  key={c.label}
                  onClick={() => send(c.label)}
                  className="flex items-center gap-2 bg-white border border-gray-100 rounded-full px-3.5 py-2 text-sm text-gray-600 hover:border-blue-200 hover:bg-blue-50/40 transition-colors"
                >
                  <c.icon size={15} variant="Linear" color="#6b7280" />
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6">
            <div className="max-w-2xl mx-auto py-6 space-y-5">
              {messages.map((m, i) => (
                <div key={i} className={cn("flex gap-3", m.role === "user" ? "justify-end" : "justify-start")}>
                  {m.role === "ivy" && (
                    <div className="shrink-0 mt-0.5">
                      <IvyOrb size={30} />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                      m.role === "user" ? "bg-black text-white rounded-br-md" : "bg-white shadow-sm text-gray-700 rounded-bl-md"
                    )}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="flex gap-3">
                  <div className="shrink-0 mt-0.5">
                    <IvyOrb size={30} active />
                  </div>
                  <div className="bg-white shadow-sm rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
                    <Dot /> <Dot delay={0.15} /> <Dot delay={0.3} />
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="px-6 pb-6">
            <div className="max-w-2xl mx-auto">
              <Composer input={input} setInput={setInput} onSend={() => send()} agentName={active.name} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Composer({
  input,
  setInput,
  onSend,
  agentName,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  agentName: string;
}) {
  return (
    <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgba(40,70,140,0.10)] border border-gray-100 p-4">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        rows={2}
        placeholder={`Initiate a query or send a command to ${agentName.startsWith("Ivy") ? "Ivy" : agentName}…`}
        className="w-full resize-none outline-none text-sm bg-transparent placeholder:text-gray-400"
      />
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <button className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400">
            <Paperclip2 size={18} variant="Linear" />
          </button>
        </div>
        <button
          onClick={onSend}
          disabled={!input.trim()}
          className="w-9 h-9 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 disabled:opacity-40"
        >
          <ArrowUp size={18} variant="Linear" color="#ffffff" />
        </button>
      </div>
    </div>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="w-1.5 h-1.5 rounded-full bg-gray-400"
      style={{ animation: "ivy-breathe 0.9s ease-in-out infinite", animationDelay: `${delay}s` }}
    />
  );
}
