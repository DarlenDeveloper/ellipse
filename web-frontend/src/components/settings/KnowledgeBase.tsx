"use client";

import { useEffect, useState } from "react";
import { Add, Trash, Book1 } from "iconsax-react";
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

export function KnowledgeBase() {
  const { enterpriseId } = useEnterpriseId();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
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
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await deleteDoc(doc(db, "knowledge_base", id));
  };

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">
            <Book1 size={20} variant="Bold" color="#1a1a1a" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Knowledge Base</h3>
            <p className="text-sm text-gray-400">
              Facts, policies, and FAQs your agents use as context when replying.
            </p>
          </div>
        </div>
      </div>

      {/* Add new entry */}
      <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <h4 className="text-sm font-bold mb-4">Add Entry</h4>
        <div className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (e.g. Refund policy, Pricing, Support hours)"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="The information the agents should know…"
            rows={4}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200 resize-y"
          />
          <button
            onClick={add}
            disabled={saving || !title.trim() || !content.trim()}
            className="flex items-center gap-2 bg-black text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-gray-800 disabled:opacity-50"
          >
            <Add size={18} variant="Linear" color="#ffffff" />
            {saving ? "Adding…" : "Add Entry"}
          </button>
        </div>
      </div>

      {/* Entries list */}
      <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <h4 className="text-sm font-bold mb-4">
          Entries {entries.length > 0 && <span className="text-gray-400 font-medium">({entries.length})</span>}
        </h4>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-400">No entries yet. Add facts your agents should know.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {entries.map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{e.title}</p>
                  <p className="text-sm text-gray-500 mt-1 whitespace-pre-wrap">{e.content}</p>
                </div>
                <button
                  onClick={() => remove(e.id)}
                  title="Delete"
                  className="text-gray-300 hover:text-red-600 shrink-0"
                >
                  <Trash size={18} variant="Linear" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
