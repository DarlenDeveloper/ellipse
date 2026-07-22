"use client";

import { useState } from "react";
import { CloseCircle, Cpu } from "iconsax-react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { cn } from "@/lib/utils";

export const AGENT_TOOLS: { id: string; label: string; note?: string }[] = [
  { id: "search_conversations", label: "Read inbox conversations" },
  { id: "reply_to_conversation", label: "Reply to customers", note: "needs a messaging channel" },
  { id: "create_crm_lead", label: "Create CRM leads", note: "needs Zoho" },
  { id: "get_sales_summary", label: "Read CRM sales", note: "needs Zoho" },
  { id: "get_reports", label: "Read business reports" },
  { id: "get_web_analytics", label: "Read website analytics", note: "needs Website" },
  { id: "create_document", label: "Create & save documents to Data" },
];

export function CustomAgentModal({
  enterpriseId,
  onClose,
}: {
  enterpriseId: string;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [tools, setTools] = useState<string[]>(["search_conversations", "create_document"]);
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) =>
    setTools((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const save = async () => {
    if (!name.trim() || !specialty.trim() || saving) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "custom_agents"), {
        enterprise_id: enterpriseId,
        name: name.trim(),
        specialty: specialty.trim(),
        tools,
        created_at: serverTimestamp(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-black flex items-center justify-center">
              <Cpu size={20} variant="Bold" color="#ffffff" />
            </span>
            <div>
              <h3 className="text-lg font-bold leading-tight">New custom agent</h3>
              <p className="text-xs text-gray-400">A specialist you define, with its own tools.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600">
            <CloseCircle size={22} variant="Linear" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Quotations Agent"
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Role &amp; specialty</label>
            <textarea
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              rows={4}
              placeholder="Describe what this agent specializes in and how it should behave. e.g. 'You draft and save professional price quotations as documents based on our pricing knowledge base. You never invent prices.'"
              className={`${inputClass} resize-y`}
            />
            <p className="text-[11px] text-gray-400 mt-1.5">
              This becomes the agent&apos;s instructions. Be specific — it keeps the agent accurate and on-topic.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Abilities</label>
            <div className="space-y-1.5">
              {AGENT_TOOLS.map((t) => {
                const on = tools.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggle(t.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-left transition-colors",
                      on ? "border-black bg-gray-50" : "border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    <span
                      className={cn(
                        "w-4 h-4 rounded flex items-center justify-center shrink-0",
                        on ? "bg-black" : "border border-gray-300"
                      )}
                    >
                      {on && <span className="w-1.5 h-1.5 bg-white rounded-sm" />}
                    </span>
                    <span className="flex-1 text-sm">
                      {t.label}
                      {t.note && <span className="text-gray-400"> · {t.note}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={save}
            disabled={saving || !name.trim() || !specialty.trim()}
            className="w-full bg-black text-white text-sm font-semibold rounded-full py-3 hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create agent"}
          </button>
        </div>
      </div>
    </div>
  );
}
