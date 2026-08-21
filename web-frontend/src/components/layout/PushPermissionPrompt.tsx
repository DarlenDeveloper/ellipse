"use client";

import { useEffect, useRef, useState } from "react";
import { Notification as NotificationIcon } from "iconsax-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { enablePushNotifications, refreshPushRegistration } from "@/lib/push-notifications";

const SESSION_KEY = "ellipse_push_permission_prompted_v2";

/**
 * Registers push for every signed-in browser. New browsers receive the native
 * permission prompt automatically; browsers that already granted permission
 * silently repair/refresh their FCM registration.
 */
export function PushPermissionPrompt() {
  const started = useRef(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current || typeof window === "undefined") return;
    started.current = true;

    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

    if (Notification.permission === "granted") {
      refreshPushRegistration().catch((error) => {
        console.error("Push registration refresh failed", error);
      });
      return;
    }

    // A denial can only be reversed in browser/site settings. Do not ask again.
    if (Notification.permission === "denied" || sessionStorage.getItem(SESSION_KEY)) return;

    sessionStorage.setItem(SESSION_KEY, "1");
    const timer = window.setTimeout(() => setOpen(true), 1200);

    return () => window.clearTimeout(timer);
  }, []);

  const allow = async () => {
    setBusy(true);
    setError("");
    try {
      await enablePushNotifications();
      setOpen(false);
      await httpsCallable(functions, "sendTestNotification")({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notifications could not be enabled.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/25 p-5 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" aria-labelledby="push-permission-title" className="w-full max-w-[430px] overflow-hidden rounded-[30px] border border-white/70 bg-white p-7 shadow-[0_30px_90px_rgba(15,23,42,0.22)]">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black shadow-lg shadow-black/15">
          <NotificationIcon size={27} color="#fff" variant="Bold" />
        </div>
        <h2 id="push-permission-title" className="mt-6 text-2xl font-bold tracking-tight text-gray-950">Stay in the loop</h2>
        <p className="mt-3 text-sm leading-6 text-gray-500">Get timely updates about new customer messages, approvals, team conversations and important workspace activity—even when Ellipse is in the background.</p>
        {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs leading-5 text-red-700">{error}</p>}
        <div className="mt-7 flex items-center gap-3">
          <button type="button" onClick={allow} disabled={busy} className="flex-1 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60">{busy ? "Enabling…" : "Allow notifications"}</button>
          <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-full px-5 py-3 text-sm font-semibold text-gray-500 transition hover:bg-gray-100">Not now</button>
        </div>
        <p className="mt-5 text-center text-[11px] leading-5 text-gray-400">You control this permission and can change it from your browser settings.</p>
      </div>
    </div>
  );
}
