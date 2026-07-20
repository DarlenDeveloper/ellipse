"use client";

import { useState } from "react";
import { CloseCircle } from "iconsax-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export function SmtpConnectModal({
  enterpriseId,
  onClose,
  onConnected,
}: {
  enterpriseId: string;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [form, setForm] = useState({
    imap_host: "",
    imap_port: "993",
    smtp_host: "",
    smtp_port: "465",
    username: "",
    password: "",
    from_email: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const fn = httpsCallable(functions, "connectSmtp");
      await fn({ enterpriseId, ...form });
      onConnected();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Connection failed. Check your credentials.");
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, key: keyof typeof form, placeholder: string, type = "text") => (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1.5">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={set(key)}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-xl font-bold">Connect SMTP / IMAP</h3>
            <p className="text-sm text-gray-400 mt-1">
              Use an app password, not your main account password.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500">
            <CloseCircle size={22} variant="Bold" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_100px] gap-3">
            {field("IMAP Host", "imap_host", "imap.example.com")}
            {field("Port", "imap_port", "993")}
          </div>
          <div className="grid grid-cols-[1fr_100px] gap-3">
            {field("SMTP Host", "smtp_host", "smtp.example.com")}
            {field("Port", "smtp_port", "465")}
          </div>
          {field("Username", "username", "you@example.com")}
          {field("Password / App Password", "password", "••••••••", "password")}
          {field("From Email (optional)", "from_email", "you@example.com")}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={submit}
            disabled={busy || !form.imap_host || !form.smtp_host || !form.username || !form.password}
            className="w-full bg-black text-white text-sm font-medium rounded-full px-5 py-3 hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? "Testing connection…" : "Test & Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}
