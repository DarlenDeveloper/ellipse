"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

const options = [
  { key: "newMessage", label: "New message in inbox", description: "Alerts when a new customer message is received." },
  { key: "teamChat", label: "New team-chat message", description: "Alerts when an organization member sends you a direct or group message." },
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
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snapshot) => {
      setPreferences({ ...defaults, ...((snapshot.data()?.notification_preferences ?? {}) as Partial<Preferences>) });
    });
  }, [user]);

  const toggle = async (key: Key) => {
    if (!user) return;
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    setSaved(false);
    await setDoc(doc(db, "users", user.uid), { notification_preferences: next, updated_at: serverTimestamp() }, { merge: true });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const sendTest = async () => {
    setTesting(true);
    setTestResult("");
    try {
      await httpsCallable(functions, "sendTestNotification")({});
      setTestResult("Test sent. Check your browser notifications.");
    } catch (error) {
      setTestResult(error instanceof Error ? error.message : "The test notification could not be sent.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
      <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">Notification preferences</h3><span className={`text-xs font-medium text-green-600 transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>Saved</span></div>
      <div className="mb-5 flex items-center justify-between gap-5 rounded-2xl bg-gray-50 p-4">
        <div><p className="text-sm font-semibold text-gray-900">Browser notifications</p><p className="mt-1 text-xs leading-5 text-gray-500">Ellipse asks for permission automatically after sign-in. Browser-level access remains under this site's permissions.</p>{testResult && <p className="mt-2 text-xs text-gray-600">{testResult}</p>}</div>
        <button type="button" onClick={sendTest} disabled={testing} className="shrink-0 rounded-full bg-black px-4 py-2 text-xs font-semibold text-white transition hover:bg-gray-800 disabled:cursor-wait disabled:opacity-50">{testing ? "Sending…" : "Send test"}</button>
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
