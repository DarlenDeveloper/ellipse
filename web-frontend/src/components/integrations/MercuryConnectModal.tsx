"use client";

import { useState } from "react";
import { CloseCircle } from "iconsax-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export function MercuryConnectModal({
  enterpriseId,
  onClose,
  onConnected,
}: {
  enterpriseId: string;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const fn = httpsCallable(functions, "connectMercury");
      await fn({ enterpriseId, apiKey: apiKey.trim(), baseUrl: baseUrl.trim() || undefined });
      onConnected();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Connection failed. Check the API key.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-xl font-bold">Connect Mercury Store</h3>
            <p className="text-sm text-gray-400 mt-1">
              Paste an API key from the store dashboard → API Keys. It&apos;s shown only once at creation.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500">
            <CloseCircle size={22} variant="Bold" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">API Key</label>
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="mck_live_xxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200 font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">
              Needs read (and write, for actions) scopes on products, orders, quotations, repairs.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Base URL (optional)</label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://us-central1-mercurycomputers-tech.cloudfunctions.net/api"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200"
            />
            <p className="text-xs text-gray-400 mt-1">Leave blank to use the default Mercury Store endpoint.</p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={submit}
            disabled={busy || !apiKey.trim()}
            className="w-full bg-black text-white text-sm font-medium rounded-full px-5 py-3 hover:bg-gray-800 disabled:opacity-50"
          >
            {busy ? "Verifying…" : "Test & Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}
