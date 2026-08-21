import { deleteToken, getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { httpsCallable } from "firebase/functions";
import app, { functions } from "./firebase";

export const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY ?? "BFnhwvVroqCChbpKrp3PMspb-oe4UT4GCJVbUTP83yk-Z_nL1RvFcsuAJZdlwQfelzUsyafR_6bl_XgrRb0162Q";

async function messagingAndWorker() {
  if (!(await isSupported()) || !("serviceWorker" in navigator)) throw new Error("Push notifications are not supported by this browser.");
  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return { messaging: getMessaging(app), registration };
}

export async function enablePushNotifications() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "Notifications are blocked in your browser settings." : "Notification permission was not granted.");
  const { messaging, registration } = await messagingAndWorker();
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Firebase did not return a device token.");
  await httpsCallable(functions, "registerPushToken")({ token, platform: "web" });
  localStorage.setItem("mercury_push_token", token);
  return token;
}

/** Refresh the server-side device registration without prompting again. */
export async function refreshPushRegistration() {
  if (!("Notification" in window) || Notification.permission !== "granted") return null;
  const { messaging, registration } = await messagingAndWorker();
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) return null;
  await httpsCallable(functions, "registerPushToken")({ token, platform: "web" });
  localStorage.setItem("mercury_push_token", token);
  return token;
}

export async function disablePushNotifications() {
  const token = localStorage.getItem("mercury_push_token");
  if (token) await httpsCallable(functions, "unregisterPushToken")({ token });
  if (await isSupported()) await deleteToken(getMessaging(app));
  localStorage.removeItem("mercury_push_token");
}

export async function listenForForegroundPush(handler: (title: string, body: string) => void) {
  if (!(await isSupported())) return () => undefined;
  return onMessage(getMessaging(app), (payload) => handler(payload.notification?.title ?? "Mercury CRM", payload.notification?.body ?? "You have a new notification."));
}
