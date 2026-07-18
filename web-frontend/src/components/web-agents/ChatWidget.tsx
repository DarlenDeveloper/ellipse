"use client";

import { useState } from "react";
import { MessageText1, Send2, CloseCircle, Minus } from "iconsax-react";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  text: string;
  sender: "bot" | "user";
  time: string;
};

const initialMessages: Message[] = [
  { id: "1", text: "Hi there! 👋 How can I help you today?", sender: "bot", time: "Now" },
];

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");

  const sendMessage = () => {
    if (!input.trim()) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      text: input,
      sender: "user",
      time: "Now",
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    // Simulate bot response
    setTimeout(() => {
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: "Thanks for reaching out! A team member will get back to you shortly. Is there anything else I can help with?",
        sender: "bot",
        time: "Now",
      };
      setMessages((prev) => [...prev, botMsg]);
    }, 1200);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Chat popup */}
      {isOpen && (
        <div className="absolute bottom-20 right-0 w-[380px] h-[520px] bg-white rounded-3xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4">
          {/* Header */}
          <div className="bg-black px-5 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center">
                <MessageText1 size={18} variant="Bold" color="#ffffff" />
              </div>
              <div>
                <p className="text-white text-sm font-semibold">Ellipse Support</p>
                <p className="text-gray-400 text-xs flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-green-400 rounded-full" />
                  Online
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10"
              >
                <Minus size={16} variant="Linear" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10"
              >
                <CloseCircle size={16} variant="Linear" />
              </button>
            </div>
          </div>

          {/* Welcome banner */}
          <div className="bg-black px-5 pb-5 shrink-0">
            <p className="text-white text-lg font-bold">Hi there! 👋</p>
            <p className="text-gray-400 text-sm mt-1">
              We usually respond within a few minutes.
            </p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn("flex", msg.sender === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                    msg.sender === "user"
                      ? "bg-black text-white rounded-br-md"
                      : "bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-md"
                  )}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-gray-100 bg-white shrink-0">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Type a message..."
                className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200"
              />
              <button
                onClick={sendMessage}
                className="w-9 h-9 bg-black rounded-full flex items-center justify-center shrink-0 hover:bg-gray-800"
              >
                <Send2 size={16} variant="Bold" color="#ffffff" />
              </button>
            </div>
            <p className="text-[10px] text-gray-300 text-center mt-2">
              Powered by Ellipse
            </p>
          </div>
        </div>
      )}

      {/* Floating bubble */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105",
          isOpen ? "bg-gray-700" : "bg-black"
        )}
      >
        {isOpen ? (
          <CloseCircle size={24} variant="Linear" color="#ffffff" />
        ) : (
          <MessageText1 size={24} variant="Bold" color="#ffffff" />
        )}
        {!isOpen && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white" />
        )}
      </button>
    </div>
  );
}
