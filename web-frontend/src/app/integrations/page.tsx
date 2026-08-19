"use client";

import { useState, useEffect, useCallback } from "react";
import { SearchNormal1, TickCircle, CloseCircle, Lock1, Clock } from "iconsax-react";
import { httpsCallable } from "firebase/functions";
import { doc, getDoc, collection, getDocs, query as fsQuery, where } from "firebase/firestore";
import { integrations as seed } from "@/components/integrations/data";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";
import { SmtpConnectModal } from "@/components/integrations/SmtpConnectModal";
import { WhatsAppConnectModal } from "@/components/integrations/WhatsAppConnectModal";
import { WebsiteConnectModal } from "@/components/integrations/WebsiteConnectModal";
import { MercuryConnectModal } from "@/components/integrations/MercuryConnectModal";
import { functions, db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

export default function IntegrationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState(seed);
  const [query, setQuery] = useState("");
  const [enterpriseId, setEnterpriseId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(true); // owner/admin may manage integrations
  const [grantedTypes, setGrantedTypes] = useState<Set<string>>(new Set());
  const [orgActive, setOrgActive] = useState<Set<string>>(new Set());
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [zohoConnected, setZohoConnected] = useState(false);
  const [smtpConnected, setSmtpConnected] = useState(false);
  const [showSmtpModal, setShowSmtpModal] = useState(false);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [showWhatsappModal, setShowWhatsappModal] = useState(false);
  const [websiteConnected, setWebsiteConnected] = useState(false);
  const [showWebsiteModal, setShowWebsiteModal] = useState(false);
  const [mercuryConnected, setMercuryConnected] = useState(false);
  const [showMercuryModal, setShowMercuryModal] = useState(false);
  const [msConnected, setMsConnected] = useState(false);
  const [connectingMs, setConnectingMs] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<{ id: string; name: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectingZoho, setConnectingZoho] = useState(false);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [employeeChoice, setEmployeeChoice] = useState<{ id: string; name: string } | null>(null);
  const [personalActive, setPersonalActive] = useState<Set<string>>(new Set());
  const [showAccessRequest, setShowAccessRequest] = useState(false);
  const [requestedTypes, setRequestedTypes] = useState<string[]>([]);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [requestingAccess, setRequestingAccess] = useState(false);

  // Apply a set of active connection types to the UI state.
  const applyActive = useCallback((active: Set<string>, googleEmailValue: string | null) => {
    setOrgActive(active);
    setGoogleEmail(active.has("google-workspace") ? googleEmailValue ?? "connected" : null);
    setZohoConnected(active.has("zoho"));
    setSmtpConnected(active.has("smtp"));
    setWhatsappConnected(active.has("whatsapp"));
    setWebsiteConnected(active.has("website"));
    setMsConnected(active.has("microsoft365"));
    setMercuryConnected(active.has("mercury"));
    setItems((prev) => prev.map((it) => ({ ...it, connected: active.has(it.id) })));
  }, []);

  // Load enterprise + all connection statuses in ONE query.
  const refresh = useCallback(async () => {
    if (!user) return;
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const entId = userSnap.data()?.enterprise_id as string | undefined;
    const role = userSnap.data()?.role as string | undefined;
    const manager = role === "owner" || role === "admin";
    setCanManage(manager);
    if (!entId) return;
    setEnterpriseId(entId);

    // Employees: which shared connections have they been granted?
    if (!manager) {
      const g = await getDoc(doc(db, "connection_grants", `${entId}_${user.uid}`));
      setGrantedTypes(new Set(((g.data()?.types as string[] | undefined) ?? [])));
      const accessRequest = await getDoc(doc(db, "access_requests", `${entId}_${user.uid}`));
      setRequestedTypes((accessRequest.data()?.types as string[] | undefined) ?? []);
      setRequestStatus((accessRequest.data()?.status as string | undefined) ?? null);
    }

    const snap = await getDocs(fsQuery(collection(db, "connections"), where("enterprise_id", "==", entId)));
    const active = new Set<string>();
    const personal = new Set<string>();
    let gEmail: string | null = null;
    snap.forEach((d) => {
      const data = d.data();
      if (data.status === "active" && data.type) {
        if (data.scope === "personal" && data.owner_uid === user.uid) {
          personal.add(data.type);
        } else if (data.scope !== "personal") {
          active.add(data.type);
          if (data.type === "google-workspace") gEmail = data.account_email ?? "connected";
        }
      }
    });
    setPersonalActive(personal);
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
      // Server-side: removes the connection AND purges its data (analytics, messages, sites).
      if (!canManage && personalActive.has(id)) {
        await httpsCallable(functions, "disconnectPersonalIntegration")({ type: id });
        setPersonalActive((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      } else {
        if (!canManage) throw new Error("Cannot disconnect a company integration.");
        await httpsCallable(functions, "disconnectIntegration")({ enterpriseId, type: id });
      }
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

  const requestAccess = async (type: string) => {
    try {
      const next = Array.from(new Set([...requestedTypes, type]));
      await httpsCallable(functions, "requestSharedAccess")({ types: next });
      setRequestedTypes(next);
      setRequestStatus("pending");
      setBanner({ type: "success", text: "Access requested — pending owner/admin approval." });
    } catch {
      setBanner({ type: "error", text: "Could not send request. Try again." });
    }
  };

  const submitAccessRequest = async () => {
    if (!requestedTypes.length || requestingAccess) return;
    setRequestingAccess(true);
    try {
      await httpsCallable(functions, "requestSharedAccess")({ types: requestedTypes });
      setRequestStatus("pending");
      setShowAccessRequest(false);
      setBanner({ type: "success", text: "Access request sent to your owner and admins." });
    } catch (error) {
      setBanner({ type: "error", text: (error as Error).message || "Could not send request. Try again." });
    } finally {
      setRequestingAccess(false);
    }
  };

  const chooseEmployeeConnection = (id: string, name: string) => {
    setEmployeeChoice({ id, name });
  };

  const connectPersonal = async (type: string) => {
    if (!enterpriseId) return;
    if (type !== "google-workspace" && type !== "zoho") {
      setBanner({ type: "error", text: "Personal connection support for this provider is still being rolled out. Google Workspace and Zoho are available now." });
      setEmployeeChoice(null);
      return;
    }
    setConnecting(true);
    try {
      const start = httpsCallable(functions, type === "zoho" ? "startZohoConnect" : "startGoogleConnect");
      const res = (await start({ enterpriseId, scope: "personal" })) as { data: { url: string } };
      window.location.href = res.data.url;
    } catch (e) {
      setBanner({ type: "error", text: (e as Error).message || "Could not start personal Google connection." });
      setConnecting(false);
      setEmployeeChoice(null);
    }
  };

  // Employees only see a shared connection as connected if they've been granted it.
  const accessItems = canManage
    ? items
    : items.map((it) => ({ ...it, connected: personalActive.has(it.id) || (it.connected && grantedTypes.has(it.id)) }));

  const filtered = accessItems.filter((it) => it.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <main className="p-8 max-w-[1200px]">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-5 mb-8 lg:flex-row">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Integrations &amp; workflows</h1>
          <p className="text-gray-400 mt-2">
            Supercharge your workflow and connect the tools you and your team use every day.
          </p>
          {!canManage && (
            <p className="text-xs text-gray-500 mt-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 inline-block">
              Company integrations are managed by owners and admins. Request access to the ones you need here.
            </p>
          )}
        </div>
        <div className="flex w-full shrink-0 flex-wrap items-center gap-3 lg:w-auto">
          {!canManage && (
            <button type="button" onClick={() => setShowAccessRequest(true)} className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition ${requestStatus === "pending" ? "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-black text-white hover:bg-gray-800"}`}>
              {requestStatus === "pending" ? <Clock size={17} variant="Bold" /> : <Lock1 size={17} variant="Bold" />}
              {requestStatus === "pending" ? "Pending · Edit request" : "Request access"}
            </button>
          )}
          <div className="relative min-w-56 flex-1 lg:w-64 lg:flex-none">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><SearchNormal1 size={18} variant="Linear" /></span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="w-full bg-white border border-gray-200 rounded-full pl-11 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200" />
          </div>
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

      {!canManage && showAccessRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onMouseDown={() => setShowAccessRequest(false)}>
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Company access</p>
                <h2 className="mt-1 text-xl font-bold">Request integrations</h2>
                <p className="mt-2 text-sm leading-6 text-gray-500">Choose the shared connections you need. An owner or admin will review your request.</p>
              </div>
              <button type="button" onClick={() => setShowAccessRequest(false)} className="rounded-full bg-gray-100 p-2 text-gray-500 hover:bg-gray-200" aria-label="Close"><CloseCircle size={20} /></button>
            </div>
            <div className="mt-5 space-y-2">
              {[...orgActive].length ? [...orgActive].map((type) => {
                const integration = items.find((item) => item.id === type);
                const checked = requestedTypes.includes(type);
                const granted = grantedTypes.has(type);
                return (
                  <label key={type} className={`flex items-center justify-between rounded-2xl border p-4 transition ${granted ? "cursor-default border-green-100 bg-green-50" : checked ? "cursor-pointer border-black bg-gray-50" : "cursor-pointer border-gray-200 hover:bg-gray-50"}`}>
                    <div><p className="text-sm font-semibold">{integration?.name ?? type}</p><p className={`mt-0.5 text-xs ${granted ? "text-green-700" : "text-gray-400"}`}>{granted ? "Access already approved" : "Use the company’s shared connection"}</p></div>
                    {granted ? <TickCircle size={20} variant="Bold" className="text-green-600" /> : <input type="checkbox" checked={checked} onChange={() => setRequestedTypes((current) => checked ? current.filter((value) => value !== type) : [...current, type])} className="h-5 w-5 accent-black" />}
                  </label>
                );
              }) : <p className="rounded-2xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">Your organization has no active shared integrations yet.</p>}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowAccessRequest(false)} className="rounded-full px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
              <button type="button" onClick={submitAccessRequest} disabled={requestingAccess || !requestedTypes.some((type) => !grantedTypes.has(type))} className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40">{requestingAccess ? "Sending…" : requestStatus === "pending" ? "Update request" : "Send request"}</button>
            </div>
          </div>
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
          const isMercury = integration.id === "mercury";
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
                !canManage
                  ? () => chooseEmployeeConnection(integration.id, integration.name)
                  : isGoogle
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
                  : isMercury
                  ? openModal(setShowMercuryModal)
                  : undefined
              }
              onDisconnect={
                canManage || personalActive.has(integration.id)
                  ? () => setDisconnectTarget({ id: integration.id, name: integration.name })
                  : undefined
              }
              onUpdate={
                !canManage
                  ? undefined
                  : isWhatsapp && whatsappConnected
                  ? openModal(setShowWhatsappModal)
                  : isSmtp && smtpConnected
                  ? openModal(setShowSmtpModal)
                  : isMercury && mercuryConnected
                  ? openModal(setShowMercuryModal)
                  : undefined
              }
              subtitle={
                !canManage && personalActive.has(integration.id)
                  ? "Your private account"
                  : !canManage && orgActive.has(integration.id) && grantedTypes.has(integration.id)
                  ? "Company access approved"
                  : !canManage && orgActive.has(integration.id) && !grantedTypes.has(integration.id)
                  ? "No access — request it"
                  : isZoho && zohoConnected
                  ? "Connected"
                  : isSmtp && smtpConnected
                  ? "Connected"
                  : isWhatsapp && whatsappConnected
                  ? "Connected"
                  : isWebsite && websiteConnected
                  ? "Connected"
                  : isMicrosoft && msConnected
                  ? "Connected"
                  : isMercury && mercuryConnected
                  ? "Connected"
                  : undefined
              }
              busy={(isGoogle && connecting) || (isZoho && connectingZoho) || (isMicrosoft && connectingMs)}
              connectedLabel={!canManage ? (personalActive.has(integration.id) ? "Personal" : "Access approved") : "Connected"}
            />
          );
        })}
      </div>

      {employeeChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-xl">
            <h3 className="text-xl font-bold">Connect {employeeChoice.name}</h3>
            <p className="text-sm text-gray-500 mt-2">Choose which account you want Ellipse to use.</p>
            <div className="grid gap-3 mt-6">
              <button
                type="button"
                disabled={!orgActive.has(employeeChoice.id)}
                onClick={async () => {
                  await requestAccess(employeeChoice.id);
                  setEmployeeChoice(null);
                }}
                className="text-left border border-gray-200 rounded-2xl p-4 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="block text-sm font-semibold">Use company connection</span>
                <span className="block text-xs text-gray-500 mt-1">
                  {orgActive.has(employeeChoice.id)
                    ? "Ask an owner or admin to approve access to the organization’s connection."
                    : "The organization has not connected this integration yet."}
                </span>
              </button>
              <button
                type="button"
                onClick={() => connectPersonal(employeeChoice.id)}
                disabled={connecting}
                className="text-left border border-gray-200 rounded-2xl p-4 hover:bg-gray-50"
              >
                <span className="block text-sm font-semibold">Connect my own account</span>
                <span className="block text-xs text-gray-500 mt-1">
                  {employeeChoice.id === "google-workspace" || employeeChoice.id === "zoho"
                    ? `Sign in with a private ${employeeChoice.name} account that only you can use.`
                    : "Personal support for this provider is rolling out next."}
                </span>
              </button>
            </div>
            <div className="flex justify-end mt-5">
              <button
                type="button"
                onClick={() => setEmployeeChoice(null)}
                className="text-sm font-medium text-gray-600 px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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

      {showMercuryModal && enterpriseId && (
        <MercuryConnectModal
          enterpriseId={enterpriseId}
          onClose={() => setShowMercuryModal(false)}
          onConnected={() => {
            setBanner({ type: "success", text: "Mercury Store connected successfully." });
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
              This removes the connection and <span className="font-medium text-gray-700">permanently deletes its data</span>{" "}
              (analytics, synced messages, tracked sites). This can&apos;t be undone. You can reconnect later and start fresh.
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
