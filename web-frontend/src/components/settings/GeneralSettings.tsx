"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { Trash, Lock1 } from "iconsax-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useEnterpriseId } from "@/lib/use-enterprise";
import { detectTimezone } from "@/lib/onboarding";

type Mode = "off" | "supervised" | "unsupervised";

function timezoneOptions(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
      .supportedValuesOf?.("timeZone");
    if (supported && supported.length) return supported;
  } catch {
    /* fall through */
  }
  return [
    "UTC",
    "Africa/Nairobi",
    "Africa/Lagos",
    "Africa/Johannesburg",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
  ];
}

export function GeneralSettings() {
  const { user } = useAuth();
  const { enterpriseId, loading: idLoading } = useEnterpriseId();
  const timezones = useMemo(timezoneOptions, []);
  const [isOwner, setIsOwner] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [timezone, setTimezone] = useState(detectTimezone());
  const [mode, setMode] = useState<Mode>("supervised");

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      setIsOwner((snap.data()?.role as string) === "owner");
    });
  }, [user]);

  useEffect(() => {
    if (!enterpriseId) return;
    let active = true;
    getDoc(doc(db, "enterprises", enterpriseId)).then((snap) => {
      if (!active) return;
      const d = snap.data() ?? {};
      setName((d.name as string) ?? "");
      setWebsite((d.website as string) ?? "");
      setIndustry((d.industry as string) ?? "");
      setTimezone((d.timezone as string) ?? detectTimezone());
      setMode(((d.mode as Mode) ?? "supervised"));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [enterpriseId]);

  const saveOrg = async () => {
    if (!enterpriseId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "enterprises", enterpriseId), {
        name: name.trim(),
        website: website.trim(),
        industry: industry.trim(),
        timezone,
        updated_at: serverTimestamp(),
      });
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  const saveDefaults = async () => {
    if (!enterpriseId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "enterprises", enterpriseId), {
        mode,
        updated_at: serverTimestamp(),
      });
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200";
  const busy = idLoading || loading;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <h3 className="text-lg font-bold mb-4">Organization Details</h3>
        {busy ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Organization Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Website</label>
                <input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Industry</label>
                <input
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="e.g. SaaS / Technology"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Time zone</label>
                <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={`${inputClass} bg-white`}>
                  {timezones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1.5">
                  Used for scheduling, daily reports, and agent activity times.
                </p>
              </div>
            </div>
            <button
              onClick={saveOrg}
              disabled={saving}
              className="mt-5 bg-black text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </>
        )}
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-lg font-bold">Agent Defaults</h3>
          {!busy && !isOwner && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">
              <Lock1 size={12} variant="Bold" color="#9ca3af" />
              Owner only
            </span>
          )}
        </div>
        {busy ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Agent Approval Mode</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as Mode)}
                  disabled={!isOwner}
                  className={`${inputClass} bg-white disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed`}
                >
                  <option value="supervised">Supervised (approve before send)</option>
                  <option value="unsupervised">Autopilot (auto-send, log for review)</option>
                  <option value="off">Off (agents don&apos;t run)</option>
                </select>
                <p className="text-xs text-gray-400 mt-1.5">
                  {isOwner
                    ? "Controls whether agents suggest, act automatically, or stay off."
                    : "Only the organization owner can change the agent approval mode."}
                </p>
              </div>
            </div>
            {isOwner && (
              <button
                onClick={saveDefaults}
                disabled={saving}
                className="mt-5 bg-black text-white text-sm font-medium rounded-full px-5 py-2.5 hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            )}
          </>
        )}
      </div>

      {savedAt && <p className="text-xs text-emerald-600">Saved.</p>}

      {/* Danger zone */}
      <div className="bg-white rounded-2xl p-6 border border-red-100 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <h3 className="text-lg font-bold text-red-600 mb-2">Danger Zone</h3>
        <p className="text-sm text-gray-500 mb-4">
          Permanently delete this organization and all its data. This action cannot be undone.
        </p>
        <button className="flex items-center gap-2 bg-red-50 text-red-600 text-sm font-medium rounded-full px-5 py-2.5 hover:bg-red-100 border border-red-200">
          <Trash size={16} variant="Linear" />
          Delete Organization
        </button>
      </div>
    </div>
  );
}
