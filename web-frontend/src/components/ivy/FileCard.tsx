"use client";

import { DocumentDownload } from "iconsax-react";

export type ChatFile = { name: string; url: string; type: string };

/**
 * Strip raw file URLs (and markdown links wrapping them) out of chat text —
 * files are shown as download cards, so the URL shouldn't appear inline. Also
 * cleans up messages saved before file cards existed.
 */
export function stripFileUrls(text: string): string {
  let s = text;
  // [label](https://…firebasestorage…) → label
  s = s.replace(/\[([^\]]+)\]\(https?:\/\/[^)]*firebasestorage[^)]*\)/gi, "$1");
  // bare firebasestorage URLs (optionally wrapped in parens)
  s = s.replace(/\(?\s*https?:\/\/[^\s)]*firebasestorage[^\s)]*\s*\)?/gi, "");
  // tidy leftover empty brackets / doubled spaces / dangling colons
  s = s.replace(/\[\s*\]|\(\s*\)/g, "").replace(/[ \t]{2,}/g, " ").replace(/\s+\n/g, "\n").trim();
  return s;
}

function badge(type: string): { label: string; color: string } {
  const t = type.toLowerCase();
  if (t.includes("xls")) return { label: "XLS", color: "bg-emerald-600" };
  if (t.includes("doc")) return { label: "DOC", color: "bg-blue-500" };
  if (t.includes("pdf")) return { label: "PDF", color: "bg-red-500" };
  return { label: "FILE", color: "bg-gray-500" };
}

export function FileCard({ file }: { file: ChatFile }) {
  const b = badge(file.type);
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 bg-white border border-gray-200 rounded-2xl p-3 hover:border-gray-300 hover:shadow-sm transition-all max-w-xs"
    >
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${b.color}`}>
        {b.label}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold truncate">{file.name}</span>
        <span className="block text-xs text-gray-400">Saved to Data · Download</span>
      </span>
      <DocumentDownload size={18} variant="Linear" color="#9ca3af" className="shrink-0 group-hover:text-gray-600" />
    </a>
  );
}
