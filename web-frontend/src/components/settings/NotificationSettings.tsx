"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { disablePushNotifications, enablePushNotifications } from "@/lib/push-notifications";

const options = [
  { key: "newMessage", label: "New message in inbox", description: "Alerts when a new customer message is received." },
  { key: "agentApproval", label: "Agent requires approval", description: "Alerts when an agent action is waiting for review." },
  { key: "actionResult", label: "Approved action result", description: "Alerts when an approved action completes or fails." },
  { key: "accessRequest", label: "Integration access", description: "Alerts for new requests and approval decisions." },
  { key: "integrationStatus", label: "Integration disconnected", description: "Alerts when a connected service needs attention." },
] as const;

type Key = typeof options[number]["key"];
type Preferences = Record<Key, boolean>;
const defaults = Object.fromEntries(options.map((item) => [item.key, true])) as Preferences;

export function NotificationSettings() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState(defaults);
  const [saved, setSaved] = useState(false);
  const [pushStatus, setPushStatus] = useState<"checking" | "enabled" | "disabled" | "blocked" | "unsupported">("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snapshot) => {
      setPreferences({ ...defaults, ...((snapshot.data()?.notification_preferences ?? {}) as Partial<Preferences>) });
    });
  }, [user]);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return setPushStatus("unsupported");
    if (Notification.permission === "denied") return setPushStatus("blocked");
    setPushStatus(Notification.permission === "granted" && Boolean(localStorage.getItem("mercury_push_token")) ? "enabled" : "disabled");
  }, []);

  const togglePush = async () => {
    setPushBusy(true);
    setPushError("");
    try {
      if (pushStatus === "enabled") {
        await disablePushNotifications();
        setPushStatus("disabled");
      } else {
        await enablePushNotifications();
        setPushStatus("enabled");
      }
    } catch (error) {
      setPushError(error instanceof Error ? error.message : "Could not configure push notifications.");
      if (Notification.permission === "denied") setPushStatus("blocked");
    } finally {
      setPushBusy(false);
    }
  };

  const toggle = async (key: Key) => {
    if (!user) return;
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    setSaved(false);
    await setDoc(doc(db, "users", user.uid), { notification_preferences: next, updated_at: serverTimestamp() }, { merge: true });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="rounded-2xl bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">Notification preferences</h3><span className={`text-xs font-medium text-green-600 transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>Saved</span></div>
      <div className="mb-5 flex items-center justify-between gap-5 rounded-2xl bg-gray-50 p-4">
        <div><p className="text-sm font-semibold text-gray-900">Browser push notifications</p><p className="mt-1 text-xs leading-5 text-gray-500">Receive alerts even when Mercury CRM is not open.</p>{pushError && <p className="mt-2 text-xs text-red-600">{pushError}</p>}</div>
        <button type="button" onClick={togglePush} disabled={pushBusy || pushStatus === "checking" || pushStatus === "unsupported" || pushStatus === "blocked"} className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${pushStatus === "enabled" ? "border border-gray-200 bg-white text-gray-700 hover:bg-gray-100" : "bg-black text-white hover:bg-gray-800"}`}>
          {pushBusy ? "Working…" : pushStatus === "enabled" ? "Disable push" : pushStatus === "blocked" ? "Blocked by browser" : pushStatus === "unsupported" ? "Not supported" : "Enable push"}
        </button>
      </div>
      <div className="divide-y divide-gray-100">
        {options.map((item) => {
          const active = preferences[item.key];
          return (
            <div key={item.key} className="flex items-center justify-between gap-6 py-4 first:pt-1 last:pb-1">
              <div><p className="text-sm font-medium text-gray-800">{item.label}</p><p className="mt-1 text-xs text-gray-400">{item.description}</p></div>
              <button type="button" role="switch" aria-checked={active} onClick={() => toggle(item.key)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${active ? "bg-blue-600" : "bg-gray-200"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${active ? "translate-x-[22px]" : "translate-x-0.5"}`} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
