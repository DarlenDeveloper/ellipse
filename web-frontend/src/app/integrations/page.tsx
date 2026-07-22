"use client";

import { useState, useEffect, useCallback } from "react";
import { SearchNormal1, TickCircle, CloseCircle } from "iconsax-react";
import { httpsCallable } from "firebase/functions";
import { doc, getDoc, deleteDoc, collection, getDocs, query as fsQuery, where } from "firebase/firestore";
import { integrations as seed } from "@/components/integrations/data";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";
import { SmtpConnectModal } from "@/components/integrations/SmtpConnectModal";
import { WhatsAppConnectModal } from "@/components/integrations/WhatsAppConnectModal";
import { WebsiteConnectModal } from "@/components/integrations/WebsiteConnectModal";
import { functions, db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

export default function IntegrationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState(seed);
  const [query, setQuery] = useState("");
  const [enterpriseId, setEnterpriseId] = useState<string | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [zohoConnected, setZohoConnected] = useState(false);
  const [smtpConnected, setSmtpConnected] = useState(false);
  const [showSmtpModal, setShowSmtpModal] = useState(false);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [showWhatsappModal, setShowWhatsappModal] = useState(false);
  const [websiteConnected, setWebsiteConnected] = useState(false);
  const [showWebsiteModal, setShowWebsiteModal] = useState(false);
  const [msConnected, setMsConnected] = useState(false);
  const [connectingMs, setConnectingMs] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<{ id: string; name: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectingZoho, setConnectingZoho] = useState(false);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Apply a set of active connection types to the UI state.
  const applyActive = useCallback((active: Set<string>, googleEmailValue: string | null) => {
    setGoogleEmail(active.has("google-workspace") ? googleEmailValue ?? "connected" : null);
    setZohoConnected(active.has("zoho"));
    setSmtpConnected(active.has("smtp"));
    setWhatsappConnected(active.has("whatsapp"));
    setWebsiteConnected(active.has("website"));
    setMsConnected(active.has("microsoft365"));
    setItems((prev) => prev.map((it) => ({ ...it, connected: active.has(it.id) })));
  }, []);

  // Load enterprise + all connection statuses in ONE query.
  const refresh = useCallback(async () => {
    if (!user) return;
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const entId = userSnap.data()?.enterprise_id as string | undefined;
    if (!entId) return;
    setEnterpriseId(entId);

    const snap = await getDocs(fsQuery(collection(db, "connections"), where("enterprise_id", "==", entId)));
    const active = new Set<string>();
    let gEmail: string | null = null;
    snap.forEach((d) => {
      const data = d.data();
      if (data.status === "active" && data.type) {
        active.add(data.type);
        if (data.type === "google-workspace") gEmail = data.account_email ?? "connected";
      }
    });
    applyActive(active, gEmail);

    // Cache for instant paint next load.
    try {
      localStorage.setItem(`ellipse_conns_${user.uid}`, JSON.stringify({ active: [...active], gEmail }));
    } catch {
      /* ignore */
    }
  }, [user, applyActive]);

  // Instant paint from cache, then refresh from Firestore.
  useEffect(() => {
    if (!user) return;
    try {
      const cached = localStorage.getItem(`ellipse_conns_${user.uid}`);
      if (cached) {
        const { active, gEmail } = JSON.parse(cached) as { active: string[]; gEmail: string | null };
        applyActive(new Set(active), gEmail);
      }
    } catch {
      /* ignore */
    }
    refresh();
  }, [user, refresh, applyActive]);

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

    const z = params.get("zoho");
    if (z === "connected") {
      setBanner({ type: "success", text: "Zoho connected successfully." });
      refresh();
      window.history.replaceState({}, "", "/integrations");
    } else if (z === "error") {
      setBanner({ type: "error", text: "Zoho connection failed. Please try again." });
      window.history.replaceState({}, "", "/integrations");
    }

    const ms = params.get("ms");
    if (ms === "connected") {
      setBanner({ type: "success", text: "Microsoft 365 connected successfully." });
      refresh();
      window.history.replaceState({}, "", "/integrations");
    } else if (ms === "error") {
      setBanner({ type: "error", text: "Microsoft 365 connection failed. Please try again." });
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

  const connectMicrosoft = async () => {
    if (!enterpriseId) {
      setBanner({ type: "error", text: "No workspace found. Finish onboarding first." });
      return;
    }
    setConnectingMs(true);
    try {
      const start = httpsCallable(functions, "startMicrosoftConnect");
      const res = (await start({ enterpriseId })) as { data: { url: string } };
      window.location.href = res.data.url;
    } catch {
      setBanner({ type: "error", text: "Could not start Microsoft connect." });
      setConnectingMs(false);
    }
  };

  const connectZoho = async () => {
    if (!enterpriseId) {
      setBanner({ type: "error", text: "No workspace found. Finish onboarding first." });
      return;
    }
    setConnectingZoho(true);
    try {
      const start = httpsCallable(functions, "startZohoConnect");
      const res = (await start({ enterpriseId })) as { data: { url: string } };
      window.location.href = res.data.url; // redirect to Zoho consent
    } catch {
      setBanner({ type: "error", text: "Could not start Zoho connect." });
      setConnectingZoho(false);
    }
  };

  const doDisconnect = async () => {
    if (!enterpriseId || !disconnectTarget) return;
    setDisconnecting(true);
    const id = disconnectTarget.id;
    try {
      await deleteDoc(doc(db, "connections", `${enterpriseId}_${id}`));
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, connected: false } : it)));
      if (id === "google-workspace") setGoogleEmail(null);
      if (id === "zoho") setZohoConnected(false);
      if (id === "smtp") setSmtpConnected(false);
      if (id === "whatsapp") setWhatsappConnected(false);
      if (id === "website") setWebsiteConnected(false);
      if (id === "microsoft365") setMsConnected(false);
      // Keep the instant-paint cache in sync.
      try {
        if (user) {
          const cached = localStorage.getItem(`ellipse_conns_${user.uid}`);
          const parsed = cached ? JSON.parse(cached) : { active: [], gEmail: null };
          parsed.active = (parsed.active ?? []).filter((t: string) => t !== id);
          if (id === "google-workspace") parsed.gEmail = null;
          localStorage.setItem(`ellipse_conns_${user.uid}`, JSON.stringify(parsed));
        }
      } catch {
        /* ignore */
      }
      setBanner({ type: "success", text: `${disconnectTarget.name} disconnected.` });
      setDisconnectTarget(null);
    } catch {
      setBanner({ type: "error", text: "Could not disconnect. Try again." });
    } finally {
      setDisconnecting(false);
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
          const isZoho = integration.id === "zoho";
          const isSmtp = integration.id === "smtp";
          const isWhatsapp = integration.id === "whatsapp";
          const isWebsite = integration.id === "website";
          const isMicrosoft = integration.id === "microsoft365";
          const openModal = (setter: (v: boolean) => void) => () => {
            if (!enterpriseId) {
              setBanner({ type: "error", text: "No workspace found. Finish onboarding first." });
              return;
            }
            setter(true);
          };
          return (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              onToggle={toggle}
              onConnectClick={
                isGoogle
                  ? connectGoogle
                  : isZoho
                  ? connectZoho
                  : isSmtp
                  ? openModal(setShowSmtpModal)
                  : isWhatsapp
                  ? openModal(setShowWhatsappModal)
                  : isWebsite
                  ? openModal(setShowWebsiteModal)
                  : isMicrosoft
                  ? connectMicrosoft
                  : undefined
              }
              onDisconnect={() => setDisconnectTarget({ id: integration.id, name: integration.name })}
              onUpdate={
                isWhatsapp && whatsappConnected
                  ? openModal(setShowWhatsappModal)
                  : isSmtp && smtpConnected
                  ? openModal(setShowSmtpModal)
                  : undefined
              }
              subtitle={
                isZoho && zohoConnected
                  ? "Connected"
                  : isSmtp && smtpConnected
                  ? "Connected"
                  : isWhatsapp && whatsappConnected
                  ? "Connected"
                  : isWebsite && websiteConnected
                  ? "Connected"
                  : isMicrosoft && msConnected
                  ? "Connected"
                  : undefined
              }
              busy={(isGoogle && connecting) || (isZoho && connectingZoho) || (isMicrosoft && connectingMs)}
            />
          );
        })}
      </div>

      {showSmtpModal && enterpriseId && (
        <SmtpConnectModal
          enterpriseId={enterpriseId}
          onClose={() => setShowSmtpModal(false)}
          onConnected={() => {
            setBanner({ type: "success", text: "SMTP / IMAP connected successfully." });
            refresh();
          }}
        />
      )}

      {showWhatsappModal && enterpriseId && (
        <WhatsAppConnectModal
          enterpriseId={enterpriseId}
          onClose={() => setShowWhatsappModal(false)}
          onConnected={() => {
            setBanner({ type: "success", text: "WhatsApp connected successfully." });
            refresh();
          }}
        />
      )}

      {showWebsiteModal && enterpriseId && (
        <WebsiteConnectModal
          enterpriseId={enterpriseId}
          onClose={() => setShowWebsiteModal(false)}
          onConnected={() => {
            setBanner({ type: "success", text: "Website connected — tag verified." });
            refresh();
          }}
        />
      )}

      {/* Disconnect confirmation */}
      {disconnectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-xl font-bold">Disconnect {disconnectTarget.name}?</h3>
            <p className="text-sm text-gray-500 mt-2">
              This removes the connection and stops syncing. You can reconnect anytime — but stored
              credentials/tokens will be cleared.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setDisconnectTarget(null)}
                disabled={disconnecting}
                className="text-sm font-medium text-gray-600 rounded-full px-5 py-2.5 hover:bg-gray-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={doDisconnect}
                disabled={disconnecting}
                className="text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-full px-5 py-2.5 disabled:opacity-50"
              >
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
