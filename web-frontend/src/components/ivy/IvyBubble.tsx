"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send2, CloseCircle, Maximize4 } from "iconsax-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useEnterpriseId } from "@/lib/use-enterprise";
import { IvyOrb } from "./IvyOrb";
import { cn } from "@/lib/utils";

type Msg = { role: "ivy" | "user"; text: string };

const SUGGESTIONS = [
  "How did we do this week?",
  "Any leads I should follow up?",
  "Summarize today across all channels",
];

export function IvyBubble() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "ivy",
      text: "Hi, I'm Ivy — your workspace agent. Soon I'll be able to talk to all your agents, pull reports, and act across your channels. I'm still coming online.",
    },
  ]);
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { enterpriseId } = useEnterpriseId();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || thinking) return;
    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setThinking(true);
    try {
      const fn = httpsCallable(functions, "askAgent");
      const res = await fn({ enterpriseId, agentId: "ivy", message: q, history });
      const reply = (res.data as { reply?: string })?.reply ?? "…";
      setMessages((m) => [...m, { role: "ivy", text: reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "ivy", text: "Something went wrong. Please try again." }]);
      console.error(e);
    } finally {
      setThinking(false);
    }
  };

  return (
    <>
      {/* Panel */}
      <div
        className={cn(
          "fixed bottom-28 right-6 z-50 w-[380px] max-w-[calc(100vw-3rem)] origin-bottom-right transition-all duration-300",
          open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-90 pointer-events-none"
        )}
      >
        <div className="bg-white rounded-3xl shadow-[0_20px_60px_rgba(40,70,140,0.25)] border border-gray-100 overflow-hidden flex flex-col h-[520px] max-h-[70vh]">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50 bg-gradient-to-br from-white to-blue-50/40">
            <IvyOrb size={40} active={thinking} />
            <div className="min-w-0 flex-1">
              <p className="font-bold leading-tight">Ivy</p>
              <p className="text-xs text-gray-400">
                {thinking ? "Thinking…" : "Your workspace agent"}
              </p>
            </div>
            <button
              onClick={() => {
                setOpen(false);
                router.push("/ivy");
              }}
              title="Open full view"
              className="text-gray-300 hover:text-gray-600"
            >
              <Maximize4 size={19} variant="Linear" />
            </button>
            <button onClick={() => setOpen(false)} className="text-gray-300 hover:text-gray-600">
              <CloseCircle size={22} variant="Linear" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    m.role === "user"
                      ? "bg-black text-white rounded-br-md"
                      : "bg-gray-50 text-gray-700 rounded-bl-md"
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex justify-start">
                <div className="bg-gray-50 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
                  <Dot /> <Dot delay={0.15} /> <Dot delay={0.3} />
                </div>
              </div>
            )}

            {/* Suggestions (only before the user has asked) */}
            {messages.length === 1 && (
              <div className="pt-1 space-y-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="block w-full text-left text-sm text-gray-600 bg-white border border-gray-100 hover:border-blue-200 hover:bg-blue-50/40 rounded-xl px-3.5 py-2.5 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-50">
            <div className="flex items-center gap-2 bg-gray-50 rounded-2xl px-3 py-1.5">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Ask Ivy anything…"
                className="flex-1 bg-transparent outline-none text-sm py-2"
              />
              <button
                onClick={() => send()}
                disabled={!input.trim()}
                className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center hover:bg-gray-800 disabled:opacity-40 shrink-0"
              >
                <Send2 size={16} variant="Bold" color="#ffffff" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open Ivy"
        className="fixed bottom-6 right-6 z-50 group"
      >
        <span
          className="relative block transition-transform group-hover:scale-105 active:scale-95"
          style={{ animation: "ivy-rotate 24s linear infinite" }}
        >
          <IvyOrb size={62} active={open} />
        </span>
      </button>
    </>
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
