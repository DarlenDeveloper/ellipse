"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { SearchNormal1, More, Cpu, Setting2 } from "iconsax-react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
} from "firebase/firestore";
import { cn } from "@/lib/utils";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

// Connection type → the agent that runs it.
const AGENT_META: Record<string, { name: string; agentId: string; channel: string; logo: string }> = {
  "google-workspace": { name: "Gmail Agent", agentId: "gmail-agent", channel: "Gmail", logo: "/logos/gmail.svg" },
  zoho: { name: "Zoho Agent", agentId: "zoho-agent", channel: "Zoho CRM", logo: "/logos/zoho.svg" },
  whatsapp: { name: "WhatsApp Agent", agentId: "whatsapp-agent", channel: "WhatsApp", logo: "/logos/whatsapp.svg" },
  odoo: { name: "Odoo Agent", agentId: "odoo-agent", channel: "Odoo", logo: "/logos/odoo.svg" },
  salesforce: { name: "Salesforce Agent", agentId: "salesforce-agent", channel: "Salesforce", logo: "/logos/salesforce.svg" },
  microsoft365: { name: "Microsoft 365 Agent", agentId: "microsoft365-agent", channel: "Microsoft 365", logo: "/logos/microsoft365.svg" },
};

type Connection = { type: string; status: string };
type Action = { agent_id?: string; status?: string; created_at?: { toDate: () => Date } };

type AgentView = {
  name: string;
  agentId: string;
  channel: string;
  logo: string;
  connected: boolean;
  executed: number;
  pending: number;
  lastActive: string;
};

function timeAgo(d?: Date): string {
  if (!d) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return `${Math.floor(hr / 24)} d ago`;
}

export default function AgentsPage() {
  const { user } = useAuth();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    let unsubConn: (() => void) | undefined;
    let unsubAct: (() => void) | undefined;

    (async () => {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const enterpriseId = userSnap.data()?.enterprise_id as string | undefined;
      if (!enterpriseId) {
        setLoading(false);
        return;
      }

      unsubConn = onSnapshot(
        query(collection(db, "connections"), where("enterprise_id", "==", enterpriseId)),
        (snap) => {
          setConnections(snap.docs.map((d) => d.data() as Connection));
          setLoading(false);
        }
      );

      unsubAct = onSnapshot(
        query(collection(db, "pending_actions"), where("enterprise_id", "==", enterpriseId)),
        (snap) => setActions(snap.docs.map((d) => d.data() as Action))
      );
    })();

    return () => {
      unsubConn?.();
      unsubAct?.();
    };
  }, [user]);

  const agents = useMemo<AgentView[]>(() => {
    return connections
      .map((conn) => {
        const meta = AGENT_META[conn.type];
        if (!meta) return null;
        const mine = actions.filter((a) => a.agent_id === meta.agentId);
        const executed = mine.filter((a) => a.status === "executed").length;
        const pending = mine.filter((a) => a.status === "pending").length;
        const last = mine
          .map((a) => a.created_at?.toDate?.())
          .filter(Boolean)
          .sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] as Date | undefined;
        return {
          ...meta,
          connected: conn.status === "active",
          executed,
          pending,
          lastActive: timeAgo(last),
        };
      })
      .filter(Boolean) as AgentView[];
  }, [connections, actions]);

  const filtered = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.channel.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
          <p className="text-gray-400 mt-1">
            Monitor the AI agents running each of your connections.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
            <SearchNormal1 size={18} variant="Linear" />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents..."
            className="w-full bg-white border border-gray-200 rounded-full pl-11 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-24 bg-white rounded-3xl border border-gray-100">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
            <Cpu size={28} variant="Bold" color="#9ca3af" />
          </div>
          <p className="text-base font-semibold text-gray-700">No agents yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Connect an integration and its agent will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filtered.map((agent) => (
            <div
              key={agent.agentId}
              className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center">
                    <Image src={agent.logo} alt={agent.name} width={24} height={24} className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold">{agent.name}</h3>
                    <p className="text-xs text-gray-400">{agent.channel}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-xs font-medium rounded-full px-3 py-1",
                      agent.connected ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                    )}
                  >
                    {agent.connected ? "Active" : "Not connected"}
                  </span>
                  <button className="text-gray-300 hover:text-gray-500">
                    <More size={18} variant="Bold" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
                <div>
                  <p className="text-lg font-bold">{agent.executed}</p>
                  <p className="text-xs text-gray-400">Actions taken</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{agent.pending}</p>
                  <p className="text-xs text-gray-400">Pending</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">{agent.lastActive}</p>
                  <p className="text-xs text-gray-400">Last active</p>
                </div>
              </div>
            </div>
          ))}

          {/* Boss agent — orchestrator, built last */}
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-6 flex items-center gap-3 opacity-70">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center">
              <Setting2 size={24} variant="Bold" color="#9ca3af" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-500">Boss Agent</h3>
              <p className="text-xs text-gray-400">Coordinates all agents · coming soon</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
