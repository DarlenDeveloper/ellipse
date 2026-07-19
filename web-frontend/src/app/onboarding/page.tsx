"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Crown,
  TickCircle,
  ArrowRight2,
  ArrowLeft2,
  Add,
  Trash,
  Lock1,
} from "iconsax-react";
import { cn } from "@/lib/utils";
import { integrations } from "@/components/integrations/data";
import { useAuth } from "@/lib/auth-context";
import {
  loadOnboardingState,
  saveCompany,
  savePlan,
  saveConnections,
  saveTeam,
  type Tier,
  type Role,
} from "@/lib/onboarding";

type Invite = { id: string; email: string; role: Role; canApprove: boolean };

const steps = ["Company", "Plan", "Connections", "Team"];

const tiers: { id: Tier; name: string; price: string; seats: string; features: string[]; popular?: boolean }[] = [
  {
    id: "starter",
    name: "Starter",
    price: "$0",
    seats: "1 user",
    features: ["Personal Assistant", "Calendar", "Daily summaries"],
  },
  {
    id: "business",
    name: "Business",
    price: "$49",
    seats: "Up to 5 users",
    features: ["Everything in Starter", "Unified Inbox", "All Connections", "Web Widget", "Shared wallet"],
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    seats: "Unlimited users",
    features: ["Everything in Business", "Custom connections", "Priority support", "SLA & SSO"],
  },
];

const seatLimits: Record<Tier, number> = { starter: 1, business: 5, enterprise: 999 };

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [step, setStep] = useState(0);
  const [enterpriseId, setEnterpriseId] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [saving, setSaving] = useState(false);

  const [company, setCompany] = useState({ name: "", industry: "SaaS / Technology", size: "1-10" });
  const [tier, setTier] = useState<Tier>("business");
  const [connected, setConnected] = useState<string[]>([]);
  const [invites, setInvites] = useState<Invite[]>([
    { id: "1", email: "", role: "employee", canApprove: false },
  ]);

  const isStarter = tier === "starter";
  const maxSeats = seatLimits[tier];

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  // Load existing progress and resume where they left off
  useEffect(() => {
    if (!user) return;
    (async () => {
      const state = await loadOnboardingState(user.uid);
      if (state.complete) {
        router.replace("/dashboard");
        return;
      }
      setEnterpriseId(state.enterpriseId);
      setCompany(state.company);
      setTier(state.tier);
      setConnected(state.connections);
      setStep(Math.min(state.step, steps.length - 1));
      setHydrating(false);
    })();
  }, [user, router]);

  const back = () => setStep((s) => Math.max(s - 1, 0));

  // Persist the current step, then advance
  const next = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      if (step === 0) {
        const id = await saveCompany(user.uid, company, enterpriseId);
        setEnterpriseId(id);
      } else if (step === 1 && enterpriseId) {
        await savePlan(enterpriseId, tier);
      } else if (step === 2 && enterpriseId) {
        await saveConnections(enterpriseId, isStarter ? [] : connected);
      }
      setStep((s) => Math.min(s + 1, steps.length - 1));
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    if (!user || !enterpriseId || saving) return;
    setSaving(true);
    try {
      await saveTeam(
        enterpriseId,
        isStarter ? [] : invites.map(({ email, role, canApprove }) => ({ email, role, canApprove }))
      );
      router.push("/dashboard");
    } finally {
      setSaving(false);
    }
  };

  const toggleConnection = (id: string) =>
    setConnected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addInvite = () => {
    if (invites.length >= maxSeats - 1) return;
    setInvites((prev) => [...prev, { id: Date.now().toString(), email: "", role: "employee", canApprove: false }]);
  };
  const removeInvite = (id: string) => setInvites((prev) => prev.filter((i) => i.id !== id));
  const updateInvite = (id: string, patch: Partial<Invite>) =>
    setInvites((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const inputClass =
    "w-full bg-white/5 border border-white/10 rounded-full px-5 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-500/50 focus:bg-white/[0.07] transition-colors";
  const selectClass =
    "w-full bg-white/5 border border-white/10 rounded-full px-5 py-3 text-sm text-white outline-none focus:border-emerald-500/50 transition-colors appearance-none [&>option]:text-black";

  if (authLoading || hydrating) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-[-150px] left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-emerald-600/10 blur-[140px] pointer-events-none" />

      {/* Top bar */}
      <header className="relative flex items-center justify-between px-8 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center p-1">
            <Image src="/ellipse-logo.png" alt="Ellipse" width={24} height={24} className="w-6 h-6 object-contain" />
          </div>
          <span className="font-bold text-lg tracking-tight text-white">Ellipse</span>
        </div>
        <button onClick={finish} className="text-sm text-white/40 hover:text-white/70">
          Skip for now
        </button>
      </header>

      {/* Stepper */}
      <div className="relative max-w-3xl w-full mx-auto px-6 pt-10">
        <div className="flex items-center justify-between mb-2">
          {steps.map((label, i) => (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
                    i < step
                      ? "bg-emerald-500 text-black"
                      : i === step
                      ? "bg-white text-black ring-4 ring-white/10"
                      : "bg-white/10 text-white/40"
                  )}
                >
                  {i < step ? <TickCircle size={18} variant="Bold" color="#000000" /> : i + 1}
                </div>
                <span className={cn("text-xs mt-2 font-medium", i <= step ? "text-white" : "text-white/40")}>{label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={cn("flex-1 h-0.5 mx-2 mb-5", i < step ? "bg-emerald-500" : "bg-white/10")} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <main className="relative flex-1 max-w-3xl w-full mx-auto px-6 py-8">
        {/* STEP 0 — Company */}
        {step === 0 && (
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2 text-white">Tell us about your company</h1>
            <p className="text-white/50 mb-8">This creates your enterprise workspace on Ellipse.</p>
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-5">
              <div>
                <label className="text-xs font-medium text-white/60 block mb-1.5">Company name</label>
                <input
                  value={company.name}
                  onChange={(e) => setCompany({ ...company, name: e.target.value })}
                  placeholder="Acme Inc."
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-white/60 block mb-1.5">Industry</label>
                  <select
                    value={company.industry}
                    onChange={(e) => setCompany({ ...company, industry: e.target.value })}
                    className={selectClass}
                  >
                    <option>SaaS / Technology</option>
                    <option>E-commerce / Retail</option>
                    <option>Finance</option>
                    <option>Healthcare</option>
                    <option>Agency / Services</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-white/60 block mb-1.5">Team size</label>
                  <select
                    value={company.size}
                    onChange={(e) => setCompany({ ...company, size: e.target.value })}
                    className={selectClass}
                  >
                    <option>1-10</option>
                    <option>11-50</option>
                    <option>51-200</option>
                    <option>200+</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 1 — Plan */}
        {step === 1 && (
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2 text-white">Choose your plan</h1>
            <p className="text-white/50 mb-8">You can change or upgrade anytime.</p>
            <div className="grid grid-cols-3 gap-4">
              {tiers.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTier(t.id)}
                  className={cn(
                    "relative text-left rounded-3xl p-5 border-2 transition-all",
                    tier === t.id
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-white/10 bg-white/5 hover:border-white/25"
                  )}
                >
                  {t.popular && (
                    <span className="absolute -top-2.5 left-5 bg-emerald-500 text-black text-[10px] font-semibold rounded-full px-2.5 py-1">
                      MOST POPULAR
                    </span>
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-white">{t.name}</span>
                    {tier === t.id && <TickCircle size={20} variant="Bold" color="#10b981" />}
                  </div>
                  <p className="text-2xl font-bold text-white">
                    {t.price}
                    <span className="text-sm text-white/40 font-normal">/mo</span>
                  </p>
                  <p className="text-xs text-white/40 mt-1 mb-4">{t.seats}</p>
                  <ul className="space-y-2">
                    {t.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-white/60">
                        <TickCircle size={14} variant="Bold" className="text-emerald-400 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 2 — Connections */}
        {step === 2 && (
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2 text-white">Connect your tools</h1>
            <p className="text-white/50 mb-8">Link the services your team uses. You can add more later.</p>
            {isStarter ? (
              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4">
                  <Lock1 size={28} variant="Bold" color="#ffffff" />
                </div>
                <h3 className="font-bold text-lg text-white">Connections aren&apos;t available on Starter</h3>
                <p className="text-sm text-white/50 mt-2 max-w-md mx-auto">
                  Upgrade to Business or Enterprise to connect Google Workspace, WhatsApp, Salesforce, and more.
                </p>
                <button onClick={() => setStep(1)} className="mt-5 bg-white text-black text-sm font-medium rounded-full px-5 py-2.5">
                  View Plans
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {integrations.map((it) => {
                  const on = connected.includes(it.id);
                  return (
                    <button
                      key={it.id}
                      onClick={() => toggleConnection(it.id)}
                      className={cn(
                        "flex items-center gap-3 rounded-full p-2 pr-5 border-2 transition-all text-left",
                        on ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 bg-white/5 hover:border-white/25"
                      )}
                    >
                      <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center shrink-0">
                        {it.logo ? (
                          <img src={it.logo} alt={it.name} className="w-6 h-6" />
                        ) : (
                          <span className="text-slate-600 font-bold">@</span>
                        )}
                      </div>
                      <span className="flex-1 text-sm font-semibold text-white">{it.name}</span>
                      {on ? (
                        <TickCircle size={20} variant="Bold" color="#10b981" />
                      ) : (
                        <Add size={18} variant="Linear" color="#ffffff" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* STEP 3 — Team */}
        {step === 3 && (
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2 text-white">Invite your team</h1>
            <p className="text-white/50 mb-2">
              You&apos;re the <span className="font-semibold text-white">Owner</span>. Add teammates and set their roles.
            </p>
            <p className="text-xs text-white/40 mb-8">
              {tier === "enterprise" ? "Unlimited seats" : `${invites.length + 1} of ${maxSeats} seats used`}
            </p>

            {isStarter ? (
              <div className="bg-white/5 border border-white/10 rounded-3xl p-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-4">
                  <Crown size={28} variant="Bold" color="#ffffff" />
                </div>
                <h3 className="font-bold text-lg text-white">Starter is a single-user plan</h3>
                <p className="text-sm text-white/50 mt-2 max-w-md mx-auto">
                  Upgrade to Business to invite up to 5 teammates and share a wallet.
                </p>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-3">
                {invites.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3">
                    <input
                      value={inv.email}
                      onChange={(e) => updateInvite(inv.id, { email: e.target.value })}
                      placeholder="teammate@company.com"
                      className="flex-1 bg-white/5 border border-white/10 rounded-full px-5 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-500/50"
                    />
                    <select
                      value={inv.role}
                      onChange={(e) => updateInvite(inv.id, { role: e.target.value as Role })}
                      className="bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50 appearance-none [&>option]:text-black"
                    >
                      <option value="admin">Admin</option>
                      <option value="employee">Employee</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-white/60 cursor-pointer select-none whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={inv.canApprove}
                        onChange={(e) => updateInvite(inv.id, { canApprove: e.target.checked })}
                        className="w-4 h-4 rounded accent-emerald-500"
                      />
                      Can approve
                    </label>
                    <button onClick={() => removeInvite(inv.id)} className="text-white/30 hover:text-red-400">
                      <Trash size={18} variant="Linear" />
                    </button>
                  </div>
                ))}
                {invites.length < maxSeats - 1 && (
                  <button
                    onClick={addInvite}
                    className="flex items-center gap-2 text-sm font-medium text-white/60 hover:text-white mt-2"
                  >
                    <Add size={18} variant="Linear" />
                    Add another
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer nav */}
      <footer className="relative max-w-3xl w-full mx-auto px-6 py-6 flex items-center justify-between">
        <button
          onClick={back}
          disabled={step === 0}
          className={cn(
            "flex items-center gap-2 text-sm font-medium rounded-full px-5 py-2.5 transition-colors",
            step === 0 ? "opacity-0 pointer-events-none" : "text-white/60 hover:bg-white/10"
          )}
        >
          <ArrowLeft2 size={16} variant="Linear" color="#ffffff" />
          Back
        </button>

        {step < steps.length - 1 ? (
          <button
            onClick={next}
            disabled={saving || (step === 0 && !company.name.trim())}
            className="flex items-center gap-2 bg-white text-black text-sm font-semibold rounded-full px-6 py-3 hover:bg-white/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Continue"}
            {!saving && <ArrowRight2 size={16} variant="Linear" color="#000000" />}
          </button>
        ) : (
          <button
            onClick={finish}
            disabled={saving}
            className="flex items-center gap-2 bg-emerald-500 text-black text-sm font-semibold rounded-full px-6 py-3 hover:bg-emerald-400 disabled:opacity-50"
          >
            {saving ? "Finishing..." : "Finish setup"}
            {!saving && <TickCircle size={16} variant="Bold" color="#000000" />}
          </button>
        )}
      </footer>
    </div>
  );
}
