"use client";

import { useEffect, useState } from "react";
import { CloseCircle, Copy, TickCircle, Warning2 } from "iconsax-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

const TAG_SRC = "https://us-central1-ellipse-desk.cloudfunctions.net/webTag";

export function WebsiteConnectModal({
  enterpriseId,
  onClose,
  onConnected,
}: {
  enterpriseId: string;
  onClose: () => void;
  onConnected: () => void;
}) {
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Generate (or fetch existing) site key on open.
  useEffect(() => {
    (async () => {
      try {
        const fn = httpsCallable(functions, "registerWebsite");
        const res = (await fn({ enterpriseId })) as { data: { siteKey: string } };
        setSiteKey(res.data.siteKey);
      } catch {
        setResult({ ok: false, msg: "Couldn't generate the tracking code. Try again." });
      }
    })();
  }, [enterpriseId]);

  const snippet = siteKey ? `<script async src="${TAG_SRC}" data-site="${siteKey}"></script>` : "";

  const copy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const verify = async () => {
    if (!url.trim()) return;
    setVerifying(true);
    setResult(null);
    try {
      const fn = httpsCallable(functions, "verifyWebsiteInstall");
      const res = (await fn({ enterpriseId, url })) as { data: { ok: boolean; found: boolean; error?: string } };
      const d = res.data;
      if (d.ok && d.found) {
        setResult({ ok: true, msg: "Tag detected and site is live. Connected!" });
        onConnected();
        setTimeout(onClose, 1200);
      } else if (d.ok && !d.found) {
        setResult({ ok: false, msg: "Site is reachable but the tag wasn't found. Make sure you pasted it and re-deployed." });
      } else {
        setResult({ ok: false, msg: d.error ?? "Verification failed." });
      }
    } catch (e: any) {
      setResult({ ok: false, msg: e?.message ?? "Verification failed." });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-xl font-bold">Connect Website</h3>
            <p className="text-sm text-gray-400 mt-1">Add the tag, deploy, then verify.</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500">
            <CloseCircle size={22} variant="Bold" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Step 1: snippet */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">
              1. Paste this in your site&apos;s &lt;head&gt;
            </label>
            <div className="relative">
              <pre className="bg-gray-900 text-gray-100 text-xs rounded-xl p-4 overflow-x-auto">
                <code>{snippet || "Generating…"}</code>
              </pre>
              {snippet && (
                <button
                  onClick={copy}
                  className="absolute top-2.5 right-2.5 flex items-center gap-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 text-white rounded-lg px-2.5 py-1.5"
                >
                  {copied ? <TickCircle size={13} variant="Bold" /> : <Copy size={13} variant="Linear" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              )}
            </div>
          </div>

          {/* Step 2: verify */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">
              2. Your website URL
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourcompany.com"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200"
            />
          </div>

          {result && (
            <div
              className={`flex items-center gap-2 text-sm rounded-xl px-4 py-3 ${
                result.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
              }`}
            >
              {result.ok ? <TickCircle size={16} variant="Bold" /> : <Warning2 size={16} variant="Bold" />}
              {result.msg}
            </div>
          )}

          <button
            onClick={verify}
            disabled={verifying || !url.trim() || !siteKey}
            className="w-full bg-black text-white text-sm font-medium rounded-full px-5 py-3 hover:bg-gray-800 disabled:opacity-50"
          >
            {verifying ? "Checking your site…" : "Verify installation"}
          </button>
        </div>
      </div>
    </div>
  );
}
