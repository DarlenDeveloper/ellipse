"use client";

import { useState, useEffect, useCallback } from "react";
import { SearchNormal1, TickCircle, CloseCircle } from "iconsax-react";
import { httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";
import { integrations as seed } from "@/components/integrations/data";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";
import { functions, db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

export default function IntegrationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState(seed);
  const [query, setQuery] = useState("");
  const [enterpriseId, setEnterpriseId] = useState<string | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load enterprise + real google connection status
  const refresh = useCallback(async () => {
    if (!user) return;
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const entId = userSnap.data()?.enterprise_id as string | undefined;
    if (!entId) return;
    setEnterpriseId(entId);

    const connSnap = await getDoc(doc(db, "connections", `${entId}_google-workspace`));
    if (connSnap.exists() && connSnap.data()?.status === "active") {
      setGoogleEmail(connSnap.data()?.account_email ?? "connected");
      setItems((prev) => prev.map((it) => (it.id === "google-workspace" ? { ...it, connected: true } : it)));
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Handle the OAuth redirect result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get("google");
    if (g === "connected") {
      setBanner({ type: "success", text: "Google Workspace connected successfully." });
      refresh();
      window.history.replaceState({}, "", "/integrations");
    } else if (g === "error") {
      setBanner({ type: "error", text: "Google connection failed. Please try again." });
      window.history.replaceState({}, "", "/integrations");
    }
  }, [refresh]);

  const connectGoogle = async () => {
    if (!enterpriseId) {
      setBanner({ type: "error", text: "No workspace found. Finish onboarding first." });
      return;
    }
    setConnecting(true);
    try {
      const start = httpsCallable(functions, "startGoogleConnect");
      const res = (await start({ enterpriseId })) as { data: { url: string } };
      window.location.href = res.data.url; // redirect to Google consent
    } catch {
      setBanner({ type: "error", text: "Could not start Google connect." });
      setConnecting(false);
    }
  };

  const toggle = (id: string) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, connected: !it.connected } : it)));

  const filtered = items.filter((it) => it.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <main className="p-8 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Integrations &amp; workflows</h1>
          <p className="text-gray-400 mt-2">
            Supercharge your workflow and connect the tools you and your team use every day.
          </p>
        </div>
        <div className="relative w-64 shrink-0">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
            <SearchNormal1 size={18} variant="Linear" />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full bg-white border border-gray-200 rounded-full pl-11 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200"
          />
        </div>
      </div>

      {/* Banner */}
      {banner && (
        <div
          className={`flex items-center gap-2 rounded-xl px-4 py-3 mb-6 text-sm font-medium ${
            banner.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-600 border border-red-200"
          }`}
        >
          {banner.type === "success" ? (
            <TickCircle size={18} variant="Bold" />
          ) : (
            <CloseCircle size={18} variant="Bold" />
          )}
          {banner.text}
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map((integration) => {
          const isGoogle = integration.id === "google-workspace";
          return (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              onToggle={toggle}
              onConnectClick={isGoogle ? connectGoogle : undefined}
              subtitle={isGoogle && googleEmail ? googleEmail : undefined}
              busy={isGoogle && connecting}
            />
          );
        })}
      </div>
    </main>
  );
}
