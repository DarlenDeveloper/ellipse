"use client";

import Image from "next/image";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

const onboardingSteps = [
  { n: 1, title: "Sign up your account" },
  { n: 2, title: "Set up your workspace" },
  { n: 3, title: "Set up your profile" },
];

export function AuthLayout({
  children,
  activeStep,
  heading = "Get Started with Us",
  subtitle = "Complete these easy steps to register your account.",
}: {
  children: ReactNode;
  activeStep?: number;
  heading?: string;
  subtitle?: string;
}) {
  return (
    <div className="min-h-screen flex bg-black p-3">
      {/* Left green gradient panel */}
      <div className="hidden lg:flex w-1/2 rounded-3xl relative overflow-hidden flex-col justify-between p-12">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-emerald-900 to-black" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-emerald-500/20 blur-[120px]" />
        <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] rounded-full bg-teal-400/10 blur-[100px]" />

        {/* Logo */}
        <div className="relative flex items-center gap-2.5">
          <div className="w-9 h-9 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center p-1.5">
            <Image src="/ellipse-logo.png" alt="Ellipse" width={24} height={24} className="w-6 h-6 object-contain" />
          </div>
          <span className="font-bold text-xl tracking-tight text-white">Ellipse</span>
        </div>

        {/* Heading + steps */}
        <div className="relative">
          <div className="flex items-start justify-between gap-8 mb-10">
            <h1 className="text-5xl font-bold text-white leading-[1.1] max-w-xs">{heading}</h1>
            <p className="text-white/60 text-sm max-w-[180px] mt-2">{subtitle}</p>
          </div>

          {/* Step cards */}
          {activeStep !== undefined && (
            <div className="grid grid-cols-3 gap-3">
              {onboardingSteps.map((step, i) => {
                const isActive = i === activeStep;
                return (
                  <div
                    key={step.n}
                    className={cn(
                      "rounded-2xl p-4 h-32 flex flex-col justify-between transition-all",
                      isActive
                        ? "bg-white"
                        : "bg-white/5 backdrop-blur border border-white/10"
                    )}
                  >
                    <div
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                        isActive ? "bg-black text-white" : "bg-white/10 text-white/50"
                      )}
                    >
                      {step.n}
                    </div>
                    <p className={cn("text-sm font-medium leading-tight", isActive ? "text-black" : "text-white/50")}>
                      {step.title}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right form area */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
