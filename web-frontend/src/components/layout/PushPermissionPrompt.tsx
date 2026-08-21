"use client";

import { useEffect, useRef } from "react";
import { enablePushNotifications, refreshPushRegistration } from "@/lib/push-notifications";

const SESSION_KEY = "ellipse_push_permission_prompted";

/**
 * Registers push for every signed-in browser. New browsers receive the native
 * permission prompt automatically; browsers that already granted permission
 * silently repair/refresh their FCM registration.
 */
export function PushPermissionPrompt() {
  const started = useRef(false);

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
    const timer = window.setTimeout(() => {
      enablePushNotifications().catch((error) => {
        // Closing the browser prompt is not an application error. A future
        // signed-in session may ask again while permission remains `default`.
        console.info("Push permission was not enabled", error);
      });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
