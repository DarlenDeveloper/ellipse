"use client";

import { useEffect, useState } from "react";
import { Add, Trash, Book1, DocumentText } from "iconsax-react";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useEnterpriseId } from "@/lib/use-enterprise";

type Entry = {
  id: string;
  title?: string;
  content?: string;
  created_at?: { toDate: () => Date };
};

function timeAgo(d?: Date): string {
  if (!d) return "";
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function KnowledgeBase() {
  const { enterpriseId } = useEnterpriseId();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!enterpriseId) return;
    const q = query(collection(db, "knowledge_base"), where("enterprise_id", "==", enterpriseId));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Entry, "id">) }))
        .sort(
          (a, b) =>
            (b.created_at?.toDate?.().getTime() ?? 0) - (a.created_at?.toDate?.().getTime() ?? 0)
        );
      setEntries(rows);
      setLoading(false);
    });
  }, [enterpriseId]);

  const add = async () => {
    if (!enterpriseId || !title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "knowledge_base"), {
        enterprise_id: enterpriseId,
        title: title.trim(),
        content: content.trim(),
        created_at: serverTimestamp(),
      });
      setTitle("");
      setContent("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await deleteDoc(doc(db, "knowledge_base", id));
  };

  const inputClass =
    "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200";

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {loading
            ? "Loading…"
            : entries.length === 0
            ? "No entries yet"
            : `${entries.length} ${entries.length === 1 ? "entry" : "entries"} your agents use as context`}
        </p>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 bg-black text-white text-sm font-medium rounded-full px-4 py-2 hover:bg-gray-800"
          >
            <Add size={18} variant="Linear" color="#ffffff" />
            Add Entry
          </button>
        )}
      </div>

      {/* Add form (collapsible) */}
      {open && (
        <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-gray-100">
          <div className="space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title — e.g. Refund policy, Pricing, Support hours"
              autoFocus
              className={inputClass}
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="The information the agents should know…"
              rows={4}
              className={`${inputClass} resize-y`}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={add}
                disabled={saving || !title.trim() || !content.trim()}
                className="flex items-center gap-2 bg-black text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? "Adding…" : "Save Entry"}
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  setTitle("");
                  setContent("");
                }}
                className="text-sm font-medium text-gray-500 rounded-full px-5 py-2.5 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entries */}
      {loading ? null : entries.length === 0 && !open ? (
        <div className="bg-white rounded-2xl p-12 shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
            <Book1 size={26} variant="Bold" color="#9ca3af" />
          </div>
          <h4 className="text-base font-semibold">Teach your agents</h4>
          <p className="text-sm text-gray-400 mt-1 max-w-xs">
            Add facts, policies, and FAQs. Every agent uses these as context when replying and qualifying leads.
          </p>
          <button
            onClick={() => setOpen(true)}
            className="mt-5 flex items-center gap-2 bg-black text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-gray-800"
          >
            <Add size={18} variant="Linear" color="#ffffff" />
            Add your first entry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {entries.map((e) => (
            <div
              key={e.id}
              className="group bg-white rounded-2xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-gray-100 hover:border-gray-200 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                  <DocumentText size={17} variant="Bold" color="#6b7280" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{e.title}</p>
                    <button
                      onClick={() => remove(e.id)}
                      title="Delete"
                      className="text-gray-300 hover:text-red-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash size={16} variant="Linear" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 mt-1.5 whitespace-pre-wrap line-clamp-4">{e.content}</p>
                  {e.created_at && (
                    <p className="text-[11px] text-gray-300 mt-3">{timeAgo(e.created_at.toDate())}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
