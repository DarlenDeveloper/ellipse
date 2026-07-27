"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function inlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s]+)/g);
  return parts.filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
    }
    if (/^https?:\/\//.test(part)) {
      return <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-purple-600 underline break-all">{part}</a>;
    }
    return <span key={index}>{part}</span>;
  });
}

export function MarkdownText({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let codeLines: string[] | null = null;

  lines.forEach((line, index) => {
    if (line.trim().startsWith("```")) {
      if (codeLines) {
        blocks.push(
          <pre key={`code-${index}`} className="overflow-x-auto rounded-xl bg-gray-950 p-3 text-xs leading-5 text-gray-100">
            <code>{codeLines.join("\n")}</code>
          </pre>
        );
        codeLines = null;
      } else {
        codeLines = [];
      }
      return;
    }
    if (codeLines) {
      codeLines.push(line);
      return;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <div key={index} className={cn("font-bold text-gray-900", level === 1 ? "text-lg mt-2" : level === 2 ? "text-base mt-2" : "text-sm mt-1")}>
          {inlineMarkdown(heading[2])}
        </div>
      );
      return;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
    if (bullet) {
      blocks.push(<div key={index} className="flex gap-2 pl-1"><span className="text-purple-500">•</span><span>{inlineMarkdown(bullet[1])}</span></div>);
      return;
    }

    const numbered = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (numbered) {
      blocks.push(<div key={index} className="flex gap-2 pl-1"><span className="min-w-5 font-medium text-purple-600">{numbered[1]}.</span><span>{inlineMarkdown(numbered[2])}</span></div>);
      return;
    }

    if (!line.trim()) {
      blocks.push(<div key={index} className="h-1" />);
      return;
    }
    blocks.push(<p key={index}>{inlineMarkdown(line)}</p>);
  });

  const unfinishedCode = codeLines as string[] | null;
  if (unfinishedCode) {
    blocks.push(<pre key="code-final" className="overflow-x-auto rounded-xl bg-gray-950 p-3 text-xs leading-5 text-gray-100"><code>{unfinishedCode.join("\n")}</code></pre>);
  }

  return <div className={cn("space-y-1.5 leading-relaxed break-words", className)}>{blocks}</div>;
}
