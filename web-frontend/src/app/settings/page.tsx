"use client";

import { useState } from "react";
import { Building, Notification, ShieldTick, Paintbucket, Trash, Profile2User } from "iconsax-react";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "general", label: "General", icon: Building },
  { id: "notifications", label: "Notifications", icon: Notification },
  { id: "security", label: "Security", icon: ShieldTick },
  { id: "appearance", label: "Appearance", icon: Paintbucket },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");

  return (
    <main className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-gray-400 mt-1">Manage your organization preferences.</p>
      </div>

      <div className="flex gap-8">
        {/* Tabs sidebar */}
        <div className="w-[200px] shrink-0 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-left",
                activeTab === tab.id
                  ? "bg-black text-white"
                  : "text-gray-500 hover:bg-gray-100"
              )}
            >
              <tab.icon size={18} variant={activeTab === tab.id ? "Bold" : "Linear"} color={activeTab === tab.id ? "#ffffff" : "#9ca3af"} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 max-w-2xl">
          {activeTab === "general" && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
                <h3 className="text-lg font-bold mb-4">Organization Details</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Organization Name</label>
                    <input
                      defaultValue="Ellipse"
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Website</label>
                    <input
                      defaultValue="https://ellipse.io"
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Industry</label>
                    <input
                      defaultValue="SaaS / Communication"
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200"
                    />
                  </div>
                </div>
                <button className="mt-5 bg-black text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-gray-800">
                  Save Changes
                </button>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
                <h3 className="text-lg font-bold mb-4">Agent Defaults</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Default AI Model</label>
                    <select className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200 bg-white">
                      <option>Gemini 2.0 Flash</option>
                      <option>Gemini 1.5 Pro</option>
                      <option>Gemini 2.0 Pro</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Agent Approval Mode</label>
                    <select className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200 bg-white">
                      <option>Human-in-the-loop (approve before send)</option>
                      <option>Autopilot (auto-send, log for review)</option>
                      <option>Supervised (auto-send low-risk, approve high-risk)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Escalation Timeout</label>
                    <input
                      defaultValue="48 hours"
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200"
                    />
                  </div>
                </div>
                <button className="mt-5 bg-black text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-gray-800">
                  Save Changes
                </button>
              </div>

              {/* Danger zone */}
              <div className="bg-white rounded-2xl p-6 border border-red-100 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
                <h3 className="text-lg font-bold text-red-600 mb-2">Danger Zone</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Permanently delete this organization and all its data. This action cannot be undone.
                </p>
                <button className="flex items-center gap-2 bg-red-50 text-red-600 text-sm font-medium rounded-full px-5 py-2.5 hover:bg-red-100 border border-red-200">
                  <Trash size={16} variant="Linear" />
                  Delete Organization
                </button>
              </div>
            </div>
          )}

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
