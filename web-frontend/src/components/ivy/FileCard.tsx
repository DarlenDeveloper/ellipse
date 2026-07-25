"use client";

import Image from "next/image";
import { DocumentDownload, Document } from "iconsax-react";

export type ChatFile = { name: string; url: string; type: string };

// Strip raw file URLs an agent may have pasted into its text (we show a card instead).
export function stripFileUrls(text: string): string {
  return text
    .replace(/\(?https?:\/\/firebasestorage\.googleapis\.com\/[^\s)]+\)?/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function logoFor(type: string): string | null {
  const t = type.toLowerCase();
  if (t.includes("xls")) return "/logos/excel.png";
  if (t.includes("doc")) return "/logos/word.png";
  return null;
}

export function FileCard({ file }: { file: ChatFile }) {
  const logo = logoFor(file.type);
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 bg-white border border-gray-200 rounded-2xl p-3 hover:border-gray-300 hover:shadow-sm transition-all max-w-xs"
    >
      <span className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-gray-50">
        {logo ? (
          <Image src={logo} alt="" width={26} height={26} className="object-contain" />
        ) : (
          <Document size={22} variant="Bold" color="#6b7280" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold truncate">{file.name}</span>
        <span className="block text-xs text-gray-400">Saved to Data · Download</span>
      </span>
      <DocumentDownload size={18} variant="Linear" color="#9ca3af" className="shrink-0 group-hover:text-gray-600" />
    </a>
  );
}
