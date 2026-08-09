"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeSlash } from "iconsax-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { useAuth } from "@/lib/auth-context";
import { getLandingRoute } from "@/lib/onboarding";

const LEGAL_VERSION = "2026-08-09";

export default function SignupPage() {
  const router = useRouter();
  const { signUpWithEmail, signInWithGoogle } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);

  const mapError = (code: string) => {
    if (code.includes("email-already-in-use")) return "An account with this email already exists.";
    if (code.includes("invalid-email")) return "Please enter a valid email address.";
    if (code.includes("weak-password")) return "Password must be at least 6 characters.";
    return "Something went wrong. Please try again.";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!acceptedLegal) {
      setError("Please accept the Terms and Conditions and Privacy Policy to continue.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const name = `${form.firstName} ${form.lastName}`.trim();
      const cred = await signUpWithEmail(name, form.email, form.password, LEGAL_VERSION);
      // Invited employees get auto-linked to their org; everyone else onboards.
      router.push(await getLandingRoute(cred.user.uid));
    } catch (err: unknown) {
      setError(mapError((err as { code?: string })?.code ?? ""));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    if (!acceptedLegal) {
      setError("Please accept the Terms and Conditions and Privacy Policy to continue.");
      return;
    }
    setLoading(true);
    try {
      const cred = await signInWithGoogle(LEGAL_VERSION);
      router.push(await getLandingRoute(cred.user.uid));
    } catch {
      setError("Google sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full bg-white/5 border border-white/10 rounded-full px-5 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-emerald-500/50 focus:bg-white/[0.07] transition-colors";

  return (
    <AuthLayout activeStep={0}>
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-white">Sign Up Account</h2>
        <p className="text-white/50 mt-2 text-sm">Enter your personal data to create your account.</p>
      </div>

      {/* SSO */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading || !acceptedLegal}
          className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 rounded-full py-3 text-sm font-medium text-white hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          <img src="/logos/google-workspace.svg" alt="" className="w-4 h-4" />
          Google
        </button>
        <button
          type="button"
          disabled
          title="Coming soon"
          className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 rounded-full py-3 text-sm font-medium text-white/40 cursor-not-allowed"
        >
          <img src="/logos/github.svg" alt="" className="w-4 h-4 opacity-40" />
          GitHub
        </button>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-xs text-white/40">Or</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
          {error}
        </div>
      )}

      <label className="mb-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left">
        <input
          type="checkbox"
          checked={acceptedLegal}
          onChange={(e) => setAcceptedLegal(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-white"
          aria-describedby="legal-consent-copy"
        />
        <span id="legal-consent-copy" className="text-xs leading-5 text-white/55">
          I have read and agree to the{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-white underline underline-offset-2">Terms and Conditions</a>
          {" "}and acknowledge the{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-white underline underline-offset-2">Privacy Policy</a>.
        </span>
      </label>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-white/60 block mb-1.5">First Name</label>
            <input
              required
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              placeholder="eg. John"
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-white/60 block mb-1.5">Last Name</label>
            <input
              required
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              placeholder="eg. Francisco"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-white/60 block mb-1.5">Email</label>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="eg. johnfrans@gmail.com"
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-white/60 block mb-1.5">Password</label>
          <div className="relative">
            <input
              required
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Enter your password"
              className={inputClass + " pr-11"}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
            >
              {showPassword ? <EyeSlash size={18} variant="Linear" /> : <Eye size={18} variant="Linear" />}
            </button>
          </div>
          <p className="text-xs text-white/40 mt-2">Must be at least 8 characters.</p>
        </div>

        <button
          type="submit"
          disabled={loading || !acceptedLegal}
          className="w-full bg-white text-black font-semibold rounded-full py-3.5 hover:bg-white/90 transition-colors mt-2 disabled:opacity-60"
        >
          {loading ? "Creating account..." : "Sign Up"}
        </button>
      </form>

      <p className="text-sm text-white/50 text-center mt-6">
        Already have an account?{" "}
        <a href="/login" className="font-semibold text-white hover:underline">
          Log in
        </a>
      </p>
    </AuthLayout>
  );
}
