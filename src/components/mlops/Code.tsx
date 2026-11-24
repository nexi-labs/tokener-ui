"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CodeBlock({ code, language, title, maxHeight = 360 }: { code: string; language?: string; title?: string; maxHeight?: number }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setDone(true); setTimeout(() => setDone(false), 1500); } catch { setDone(false); }
  };
  return (
    <div className="rounded-md border border-border overflow-hidden bg-ink-800">
      <div className="flex items-center justify-between px-3 h-8 border-b border-white/10 text-[11px] text-text-tertiary">
        <span className="truncate">{title ?? language ?? "text"}</span>
        <button onClick={copy} className="inline-flex items-center gap-1 hover:text-text-inverse" aria-label="Copy to clipboard">{done ? <Check size={12} /> : <Copy size={12} />}{done ? "Copied" : "Copy"}</button>
      </div>
      <pre className="p-3 overflow-auto text-[12px] leading-relaxed font-code text-[#D8E4E2]" style={{ maxHeight }}><code>{code}</code></pre>
    </div>
  );
}

