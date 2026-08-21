"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, type Timestamp } from "firebase/firestore";
import { Notification as NotificationIcon, TickCircle } from "iconsax-react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { listenForForegroundPush } from "@/lib/push-notifications";

type Notice = {
  id: string;
  title: string;
  body: string;
  href?: string | null;
  read: boolean;
  created_at?: Timestamp | null;
};

function relativeTime(value?: Timestamp | null) {
  if (!value) return "Just now";
  const seconds = Math.max(0, Math.floor((Date.now() - value.toMillis()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function NotificationCenter() {
  const { user } = useAuth();
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, "notifications"), where("recipient_uid", "==", user.uid), orderBy("created_at", "desc"), limit(30)), (snapshot) => {
      setLoadError(false);
      setNotices(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Notice, "id">) }))
        .sort((a, b) => (b.created_at?.toMillis() ?? 0) - (a.created_at?.toMillis() ?? 0)));
    }, (error) => {
      console.error("Notification listener failed", error);
      setLoadError(true);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    // FCM automatically displays background notifications, but foreground
    // messages require an explicit listener. Registration is handled once at
    // the authenticated app-shell level.
    let unsubscribe: () => void = () => undefined;
    listenForForegroundPush((title, body) => {
      if (Notification.permission === "granted") new Notification(title, { body });
    }).then((stop) => { unsubscribe = stop; }).catch((error) => console.error("Foreground push listener failed", error));
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const unread = useMemo(() => notices.filter((item) => !item.read).length, [notices]);
  const markRead = async (item: Notice) => {
    if (!item.read) await updateDoc(doc(db, "notifications", item.id), { read: true, read_at: serverTimestamp() });
  };
  const openNotice = async (item: Notice) => {
    await markRead(item);
    setOpen(false);
    if (item.href) router.push(item.href);
  };
  const markAllRead = async () => Promise.all(notices.filter((item) => !item.read).map(markRead));

  return (
    <div ref={root} className="fixed right-7 top-6 z-40">
      <button type="button" onClick={() => setOpen((value) => !value)} className="relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm hover:bg-gray-50" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
        <NotificationIcon size={20} variant={unread ? "Bold" : "Linear"} color="#111827" />
        {unread > 0 && <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-[390px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div><p className="font-bold">Notifications</p><p className="text-xs text-gray-400">{unread ? `${unread} unread` : "You're all caught up"}</p></div>
            {unread > 0 && <button type="button" onClick={markAllRead} className="text-xs font-semibold text-blue-600 hover:text-blue-700">Mark all read</button>}
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {loadError ? (
              <div className="flex flex-col items-center px-6 py-12 text-center"><p className="text-sm font-semibold text-red-600">Notifications could not load</p><p className="mt-1 text-xs text-gray-400">Refresh the page and try again.</p></div>
            ) : notices.length ? notices.map((item) => (
              <button key={item.id} type="button" onClick={() => openNotice(item)} className={`flex w-full gap-3 border-b border-gray-50 px-5 py-4 text-left transition hover:bg-gray-50 ${item.read ? "bg-white" : "bg-blue-50/60"}`}>
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.read ? "bg-gray-200" : "bg-blue-600"}`} />
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-gray-900">{item.title}</span><span className="mt-1 block text-xs leading-5 text-gray-500">{item.body}</span><span className="mt-2 block text-[11px] text-gray-400">{relativeTime(item.created_at)}</span></span>
              </button>
            )) : (
              <div className="flex flex-col items-center px-6 py-12 text-center"><TickCircle size={34} variant="Linear" color="#9ca3af" /><p className="mt-3 text-sm font-semibold">No notifications yet</p><p className="mt-1 text-xs text-gray-400">Important workspace updates will appear here.</p></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
