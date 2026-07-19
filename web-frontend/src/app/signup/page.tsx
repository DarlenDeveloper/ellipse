"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeSlash } from "iconsax-react";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default function SignupPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push("/onboarding");
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
        <button className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 rounded-full py-3 text-sm font-medium text-white hover:bg-white/10 transition-colors">
          <img src="/logos/google-workspace.svg" alt="" className="w-4 h-4" />
          Google
        </button>
        <button className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 rounded-full py-3 text-sm font-medium text-white hover:bg-white/10 transition-colors">
          <img src="/logos/github.svg" alt="" className="w-4 h-4" />
          GitHub
        </button>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-xs text-white/40">Or</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

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
          className="w-full bg-white text-black font-semibold rounded-full py-3.5 hover:bg-white/90 transition-colors mt-2"
        >
          Sign Up
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
