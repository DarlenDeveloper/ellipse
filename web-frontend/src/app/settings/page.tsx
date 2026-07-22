"use client";

import { useState } from "react";
import { Building, Notification, ShieldTick, Paintbucket, Book1 } from "iconsax-react";
import { cn } from "@/lib/utils";
import { KnowledgeBase } from "@/components/settings/KnowledgeBase";
import { GeneralSettings } from "@/components/settings/GeneralSettings";

type TabId = "general" | "knowledge" | "notifications" | "security" | "appearance";

const tabGroups: {
  group: string;
  items: { id: TabId; label: string; desc: string; icon: typeof Building }[];
}[] = [
  {
    group: "Workspace",
    items: [
      { id: "general", label: "General", desc: "Org details & agent defaults", icon: Building },
      { id: "knowledge", label: "Knowledge Base", desc: "Facts your agents rely on", icon: Book1 },
    ],
  },
  {
    group: "Preferences",
    items: [
      { id: "notifications", label: "Notifications", desc: "What we alert you about", icon: Notification },
      { id: "appearance", label: "Appearance", desc: "Theme & accent color", icon: Paintbucket },
    ],
  },
  {
    group: "Account",
    items: [{ id: "security", label: "Security", desc: "Access & authentication", icon: ShieldTick }],
  },
];

const allTabs = tabGroups.flatMap((g) => g.items);

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const active = allTabs.find((t) => t.id === activeTab)!;

  return (
    <main className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-gray-400 mt-1">Manage your organization preferences.</p>
      </div>

      <div className="flex gap-8 items-start">
        {/* Tabs sidebar */}
        <aside className="w-[240px] shrink-0 bg-white rounded-2xl p-3 shadow-[0_4px_20px_rgba(0,0,0,0.04)] sticky top-8">
          {tabGroups.map((grp) => (
            <div key={grp.group} className="mb-3 last:mb-0">
              <p className="px-3 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-300">
                {grp.group}
              </p>
              <div className="space-y-0.5">
                {grp.items.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left group",
                        isActive ? "bg-black" : "hover:bg-gray-50"
                      )}
                    >
                      <span
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                          isActive ? "bg-white/15" : "bg-gray-50 group-hover:bg-white"
                        )}
                      >
                        <tab.icon
                          size={17}
                          variant={isActive ? "Bold" : "Linear"}
                          color={isActive ? "#ffffff" : "#6b7280"}
                        />
                      </span>
                      <span className="min-w-0">
                        <span className={cn("block text-sm font-medium", isActive ? "text-white" : "text-gray-800")}>
                          {tab.label}
                        </span>
                        <span className={cn("block text-[11px] truncate", isActive ? "text-white/50" : "text-gray-400")}>
                          {tab.desc}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        {/* Content */}
        <div className="flex-1 max-w-2xl">
          {/* Section heading */}
          <div className="flex items-center gap-3 mb-5">
            <span className="w-10 h-10 rounded-xl bg-black flex items-center justify-center">
              <active.icon size={20} variant="Bold" color="#ffffff" />
            </span>
            <div>
              <h2 className="text-xl font-bold leading-tight">{active.label}</h2>
              <p className="text-sm text-gray-400">{active.desc}</p>
            </div>
          </div>

          {activeTab === "general" && <GeneralSettings />}

          {activeTab === "knowledge" && <KnowledgeBase />}

          {activeTab === "notifications" && (
            <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
              <h3 className="text-lg font-bold mb-4">Notification Preferences</h3>
              <div className="space-y-4">
                {[
                  "New message in inbox",
                  "Agent requires approval",
                  "Escalation triggered",
                  "Weekly analytics digest",
                  "Integration disconnected",
                ].map((item) => (
                  <div key={item} className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-700">{item}</span>
                    <button className="relative w-11 h-6 rounded-full bg-blue-500 transition-colors">
                      <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow translate-x-[22px]" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
              <h3 className="text-lg font-bold mb-4">Security Settings</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">Two-Factor Authentication</p>
                    <p className="text-xs text-gray-400">Require 2FA for all team members</p>
                  </div>
                  <button className="relative w-11 h-6 rounded-full bg-gray-200 transition-colors">
                    <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow translate-x-0.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">Session Timeout</p>
                    <p className="text-xs text-gray-400">Auto-logout after inactivity</p>
                  </div>
                  <select className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white">
                    <option>30 minutes</option>
                    <option>1 hour</option>
                    <option>4 hours</option>
                    <option>Never</option>
                  </select>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">IP Whitelisting</p>
                    <p className="text-xs text-gray-400">Restrict access to specific IPs</p>
                  </div>
                  <button className="relative w-11 h-6 rounded-full bg-gray-200 transition-colors">
                    <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow translate-x-0.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "appearance" && (
            <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
              <h3 className="text-lg font-bold mb-4">Appearance</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2">Theme</label>
                  <div className="flex gap-3">
                    {["Light", "Dark", "System"].map((t) => (
                      <button
                        key={t}
                        className={cn(
                          "px-4 py-2 rounded-xl text-sm font-medium border",
                          t === "Light" ? "bg-black text-white border-black" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2">Accent Color</label>
                  <div className="flex gap-2">
                    {["bg-black", "bg-blue-500", "bg-purple-500", "bg-green-500", "bg-orange-500"].map((c) => (
                      <button key={c} className={cn("w-8 h-8 rounded-full", c, c === "bg-black" && "ring-2 ring-offset-2 ring-black")} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
