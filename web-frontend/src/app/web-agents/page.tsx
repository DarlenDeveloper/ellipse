"use client";

import { useState } from "react";
import {
  Home2,
  Document,
  MessageQuestion,
  Setting2,
  Global,
  ArrowRight2,
  DocumentUpload,
  Link1,
  MessageText1,
  DocumentText,
  Messages1,
  Import,
} from "iconsax-react";
import { cn } from "@/lib/utils";
import { ChatWidget } from "@/components/web-agents/ChatWidget";

const subNav = [
  { id: "overview", label: "Overview", icon: Home2 },
  { id: "content", label: "Content", icon: Document },
  { id: "answers", label: "Custom Answers", icon: MessageQuestion, badge: 3 },
  { id: "settings", label: "Settings", icon: Setting2 },
];

const contentSources = [
  {
    id: "1",
    title: "Import external content",
    description: "Import content from public URLs, like knowledge bases or websites",
    icon: Link1,
  },
  {
    id: "2",
    title: "Use your Help Center",
    description: "Let the bot learn from support content in your Help Center",
    icon: Global,
    badge: 4,
  },
  {
    id: "3",
    title: "Use Snippets",
    description: "Create plain text content specific to the bot, not publicly available",
    icon: MessageText1,
    badge: 2,
  },
  {
    id: "4",
    title: "Import content from files",
    description: "Upload PDF files and we'll fetch all the text data inside",
    icon: DocumentUpload,
  },
  {
    id: "5",
    title: "Use Custom Answers",
    description: "Let the bot learn from your bespoke answers and actions",
    icon: MessageQuestion,
  },
  {
    id: "6",
    title: "Use Inbox conversation content",
    description: "Let the bot learn from conversations handled by your team in the Inbox",
    icon: Messages1,
  },
];

export default function WebAgentsPage() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="flex h-screen">
      {/* Secondary sidebar */}
      <aside className="w-[200px] shrink-0 bg-white border-r border-gray-100 py-6 px-3 flex flex-col">
        <div className="flex items-center gap-2 px-3 mb-6">
          <div className="w-7 h-7 bg-black rounded-lg flex items-center justify-center">
            <Global size={14} variant="Bold" color="#ffffff" />
          </div>
          <span className="text-sm font-bold">Web Agent</span>
        </div>

        <nav className="space-y-1">
          {subNav.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left",
                activeTab === item.id
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-500 hover:bg-gray-50"
              )}
            >
              <item.icon
                size={16}
                variant={activeTab === item.id ? "Bold" : "Linear"}
                color={activeTab === item.id ? "#111111" : "#9ca3af"}
              />
              {item.label}
              {item.badge && (
                <span className="ml-auto text-[10px] bg-blue-100 text-blue-700 font-semibold rounded-full px-1.5 py-0.5">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-8">
        {activeTab === "overview" && (
          <div className="max-w-4xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                <Global size={22} variant="Bold" color="#1a1a1a" />
                Overview
              </h1>
              <button className="text-sm font-medium border border-gray-200 rounded-full px-4 py-2 text-gray-600 hover:bg-gray-50">
                Learn ↓
              </button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-5 gap-4 mb-8">
              {[
                { value: "72.4%", label: "Answer rate", link: "Report" },
                { value: "54.2%", label: "Deflection rate" },
                { value: "41.8%", label: "Resolution rate" },
                { value: "124", label: "Conversations", link: "Inbox" },
                { value: "8", label: "Usage this period", link: "Billing" },
              ].map((s) => (
                <div key={s.label} className="bg-white rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-gray-100">
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-gray-400 mt-1">{s.label}</p>
                  {s.link && (
                    <p className="text-xs text-blue-600 font-medium mt-2 cursor-pointer hover:underline">
                      → {s.link}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-gray-200 mb-6">
              {["Add content", "Set up and go live", "Optimize"].map((tab, i) => (
                <button
                  key={tab}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                    i === 0
                      ? "border-black text-black"
                      : "border-transparent text-gray-400 hover:text-gray-600"
                  )}
                >
                  {tab}
                  {i === 0 && <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5">6</span>}
                  {i === 1 && <span className="ml-1.5 text-xs bg-green-100 text-green-700 rounded-full px-1.5 py-0.5">Live</span>}
                </button>
              ))}
            </div>

            {/* Content description */}
            <p className="text-sm text-gray-500 mb-5">
              The bot will use AI to automatically generate answers using content you&apos;ve imported.
            </p>

            {/* Content source cards */}
            <div className="space-y-3">
              {contentSources.map((source) => (
                <button
                  key={source.id}
                  className="w-full flex items-center gap-4 bg-white rounded-2xl px-5 py-4 border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-md transition-shadow text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                    <source.icon size={20} variant="Linear" color="#1a1a1a" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{source.title}</p>
                      {source.badge && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 font-semibold rounded-full px-1.5 py-0.5">
                          {source.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{source.description}</p>
                  </div>
                  <ArrowRight2 size={16} variant="Linear" color="#d1d5db" />
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === "content" && (
          <div className="max-w-3xl">
            <h1 className="text-2xl font-bold tracking-tight mb-4">Content</h1>
            <p className="text-gray-400 mb-6">Manage knowledge base articles and training content for the bot.</p>
            <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center">
              <Import size={40} variant="Linear" color="#d1d5db" className="mx-auto mb-4" />
              <p className="text-sm text-gray-500 mb-4">Drag and drop files here or click to upload</p>
              <button className="bg-black text-white text-sm font-medium rounded-full px-5 py-2.5">
                Upload Content
              </button>
            </div>
          </div>
        )}

        {activeTab === "answers" && (
          <div className="max-w-3xl">
            <h1 className="text-2xl font-bold tracking-tight mb-4">Custom Answers</h1>
            <p className="text-gray-400 mb-6">Define specific answers for common questions the bot should handle.</p>
            <div className="space-y-3">
              {["What are your pricing plans?", "How do I reset my password?", "Do you offer a free trial?"].map((q) => (
                <div key={q} className="bg-white rounded-2xl p-5 border border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{q}</p>
                    <p className="text-xs text-gray-400 mt-1">1 answer configured</p>
                  </div>
                  <ArrowRight2 size={16} variant="Linear" color="#d1d5db" />
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold tracking-tight mb-4">Bot Settings</h1>
            <div className="bg-white rounded-2xl p-6 border border-gray-100 space-y-5">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Bot Name</label>
                <input defaultValue="Ellipse Assistant" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Welcome Message</label>
                <textarea defaultValue="Hi there! 👋 How can I help you today?" rows={3} className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200 resize-none" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Brand Color</label>
                <div className="flex gap-2">
                  {["bg-black", "bg-blue-600", "bg-purple-600", "bg-green-600", "bg-orange-500"].map((c) => (
                    <button key={c} className={cn("w-8 h-8 rounded-full", c, c === "bg-black" && "ring-2 ring-offset-2 ring-black")} />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Escalation Trigger</label>
                <select className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white outline-none">
                  <option>After 3 failed attempts</option>
                  <option>On user request</option>
                  <option>After 2 minutes without resolution</option>
                </select>
              </div>
              <button className="bg-black text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-gray-800">
                Save Changes
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Chat widget preview */}
      <ChatWidget />
    </div>
  );
}
