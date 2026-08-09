import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f7f7f8] text-[#1d1d22]">
      <header className="border-b border-black/[0.06] bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link href="/signup" className="text-sm font-bold tracking-[0.22em]">ELLIPSE</Link>
          <Link href="/signup" className="rounded-full bg-black px-5 py-2.5 text-xs font-semibold text-white">Create account</Link>
        </div>
      </header>
      <article className="mx-auto max-w-4xl px-6 py-16 sm:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/40">Legal</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">{title}</h1>
        <p className="mt-6 max-w-3xl text-base leading-8 text-black/55">{summary}</p>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-y border-black/[0.07] py-4 text-xs text-black/45">
          <span>Effective: 9 August 2026</span>
          <span>Last updated: 9 August 2026</span>
          <span>Version: 2026-08-09</span>
        </div>
        <div className="legal-copy mt-12 space-y-10 text-[15px] leading-7 text-black/65">{children}</div>
      </article>
      <footer className="border-t border-black/[0.06] px-6 py-8 text-center text-xs text-black/35">
        © 2026 ELLIPSE · <Link href="/terms" className="hover:text-black">Terms</Link> · <Link href="/privacy" className="hover:text-black">Privacy</Link>
      </footer>
    </main>
  );
}

export function LegalSection({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight text-black"><span className="mr-3 text-black/25">{n}</span>{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
