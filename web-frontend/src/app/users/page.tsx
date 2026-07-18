"use client";

import { useState } from "react";
import { SearchNormal1, Add, More, ShieldTick, Crown, Eye, Profile2User } from "iconsax-react";
import { cn } from "@/lib/utils";

type Role = "Owner" | "Admin" | "Manager" | "Member" | "Viewer";

type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  initial: string;
  color: string;
  status: "Active" | "Invited" | "Disabled";
};

const roleIcons: Record<Role, typeof Crown> = {
  Owner: Crown,
  Admin: ShieldTick,
  Manager: ShieldTick,
  Member: Profile2User,
  Viewer: Eye,
};

const roleColors: Record<Role, string> = {
  Owner: "bg-amber-50 text-amber-700",
  Admin: "bg-purple-50 text-purple-700",
  Manager: "bg-blue-50 text-blue-700",
  Member: "bg-gray-50 text-gray-600",
  Viewer: "bg-green-50 text-green-700",
};

const statusColors: Record<string, string> = {
  Active: "bg-green-50 text-green-700",
  Invited: "bg-yellow-50 text-yellow-700",
  Disabled: "bg-red-50 text-red-600",
};

const initialUsers: User[] = [
  { id: "1", name: "George Kiguli", email: "george@ellipse.io", role: "Owner", initial: "G", color: "bg-black text-white", status: "Active" },
  { id: "2", name: "Sarah Chen", email: "sarah@ellipse.io", role: "Admin", initial: "S", color: "bg-purple-500 text-white", status: "Active" },
  { id: "3", name: "Marcus Obi", email: "marcus@ellipse.io", role: "Manager", initial: "M", color: "bg-pink-500 text-white", status: "Active" },
  { id: "4", name: "Priya Nair", email: "priya@ellipse.io", role: "Member", initial: "P", color: "bg-emerald-500 text-white", status: "Active" },
  { id: "5", name: "Dev Wren", email: "dev@ellipse.io", role: "Member", initial: "D", color: "bg-amber-500 text-white", status: "Invited" },
  { id: "6", name: "Jordan Miles", email: "jordan@ellipse.io", role: "Viewer", initial: "J", color: "bg-blue-500 text-white", status: "Active" },
];

export default function UsersPage() {
  const [users] = useState(initialUsers);
  const [query, setQuery] = useState("");

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <main className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Members</h1>
          <p className="text-gray-400 mt-1">Manage your team and their roles within Ellipse.</p>
        </div>
        <button className="flex items-center gap-2 bg-black text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-gray-800">
          <Add size={18} variant="Linear" color="#ffffff" />
          Invite Member
        </button>
      </div>

      {/* Search + role filter */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
            <SearchNormal1 size={18} variant="Linear" />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members..."
            className="w-full bg-white border border-gray-200 rounded-full pl-11 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200"
          />
        </div>
        <div className="flex items-center gap-2">
          {(["All", "Owner", "Admin", "Manager", "Member", "Viewer"] as const).map((r) => (
            <button
              key={r}
              className="text-xs font-medium border border-gray-200 rounded-full px-3 py-1.5 text-gray-600 hover:bg-gray-100"
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_1.2fr_0.8fr_0.7fr_50px] gap-4 px-6 py-4 text-xs text-gray-400 font-medium border-b border-gray-100">
          <span>Name</span>
          <span>Email</span>
          <span>Role</span>
          <span>Status</span>
          <span></span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-50">
          {filtered.map((user) => {
            const RoleIcon = roleIcons[user.role];
            return (
              <div
                key={user.id}
                className="grid grid-cols-[1fr_1.2fr_0.8fr_0.7fr_50px] gap-4 px-6 py-4 items-center hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold", user.color)}>
                    {user.initial}
                  </div>
                  <span className="text-sm font-semibold">{user.name}</span>
                </div>
                <span className="text-sm text-gray-500">{user.email}</span>
                <span className={cn("text-xs font-medium rounded-full px-3 py-1 w-fit flex items-center gap-1.5", roleColors[user.role])}>
                  <RoleIcon size={12} variant="Bold" />
                  {user.role}
                </span>
                <span className={cn("text-xs font-medium rounded-full px-3 py-1 w-fit", statusColors[user.status])}>
                  {user.status}
                </span>
                <button className="text-gray-300 hover:text-gray-500">
                  <More size={18} variant="Bold" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Role legend */}
      <div className="mt-8 bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <h3 className="text-sm font-bold mb-4">Role Permissions</h3>
        <div className="grid grid-cols-5 gap-4 text-xs text-gray-500">
          <div><span className="font-semibold text-gray-900">Owner</span> — Full access, billing, delete org</div>
          <div><span className="font-semibold text-gray-900">Admin</span> — Manage members, integrations, agents</div>
          <div><span className="font-semibold text-gray-900">Manager</span> — View analytics, manage threads, approve</div>
          <div><span className="font-semibold text-gray-900">Member</span> — Use inbox, respond, view assigned</div>
          <div><span className="font-semibold text-gray-900">Viewer</span> — Read-only access</div>
        </div>
      </div>
    </main>
  );
}
