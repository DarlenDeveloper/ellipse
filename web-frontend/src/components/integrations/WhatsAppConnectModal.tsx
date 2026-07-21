"use client";

import { useState } from "react";
import { CloseCircle } from "iconsax-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export function WhatsAppConnectModal({
  enterpriseId,
  onClose,
  onConnected,
}: {
  enterpriseId: string;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [form, setForm] = useState({
    phone_number_id: "",
    access_token: "",
    waba_id: "",
    display_phone_number: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const fn = httpsCallable(functions, "connectWhatsapp");
      await fn({ enterpriseId, ...form });
      onConnected();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Connection failed. Check your Phone Number ID and token.");
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, key: keyof typeof form, placeholder: string, hint?: string) => (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1.5">{label}</label>
      <input
        value={form[key]}
        onChange={set(key)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200"
      />
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-xl font-bold">Connect WhatsApp</h3>
            <p className="text-sm text-gray-400 mt-1">
              From your Meta app → WhatsApp → API Setup.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500">
            <CloseCircle size={22} variant="Bold" />
          </button>
        </div>

        <div className="space-y-4">
          {field("Phone Number ID", "phone_number_id", "1029384756…")}
          {field("Access Token", "access_token", "EAAG…", "Temporary token works for testing; use a permanent one for production.")}
          {field("WhatsApp Business Account ID", "waba_id", "optional")}
          {field("Display Phone Number", "display_phone_number", "optional, e.g. +1 555…")}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={submit}
            disabled={busy || !form.phone_number_id || !form.access_token}
            className="w-full bg-black text-white text-sm font-medium rounded-full px-5 py-3 hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? "Verifying…" : "Test & Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}
