"use client";

import { useState } from "react";
import clsx from "clsx";
import { Check, Copy } from "lucide-react";

export type CodeTab = { label: string; lang: string; code: string };

export function CodeTabs({ tabs, dark = true }: { tabs: CodeTab[]; dark?: boolean }) {
  const [i, setI] = useState(0);
  const [copied, setCopied] = useState(false);
  const tab = tabs[i];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tab.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className={clsx("rounded-xl overflow-hidden border", dark ? "bg-ink-900 border-white/10" : "bg-ink-800 border-ink-600")}>
      <div className="flex items-center justify-between border-b border-white/10 pr-2">
        <div className="flex overflow-x-auto">
          {tabs.map((t, idx) => (
            <button
              key={t.label}
              onClick={() => setI(idx)}
              className={clsx(
                "px-4 h-10 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
                idx === i ? "text-text-inverse border-accent-500" : "text-text-tertiary border-transparent hover:text-text-inverse"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={copy} aria-label="Copy code" className="h-8 w-8 rounded flex items-center justify-center text-text-tertiary hover:text-text-inverse hover:bg-white/10">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre className="p-4 sm:p-5 text-[12.5px] leading-relaxed font-mono text-[#cfe3df] overflow-x-auto">
        <code>{tab.code}</code>
      </pre>
    </div>
  );
}

export function Code({ children, lang }: { children: string; lang?: string }) {
  return (
    <div className="rounded-lg bg-ink-900 border border-white/10 overflow-hidden">
      {lang && <div className="px-4 h-8 flex items-center text-[11px] font-mono text-text-tertiary border-b border-white/10">{lang}</div>}
      <pre className="p-4 text-[12.5px] leading-relaxed font-mono text-[#cfe3df] overflow-x-auto"><code>{children}</code></pre>
    </div>
  );
}
