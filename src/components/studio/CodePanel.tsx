"use client";

import clsx from "clsx";
import { Check, Copy, Download } from "lucide-react";
import { useState, type ReactNode } from "react";
import { BY_KIND } from "./catalog";
import type { CodeTab, Graph, Issue } from "./types";

const DSL_KW = /^(POLICY|SCOPE|ENFORCE|ALLOW|DENY|MODEL|IMAGE|AUDIO|EMBEDDING|TOOLS|HOURS|TIMEZONE|LIMIT|TOKENS|COST|PER|ON|BREACH|WARN|THROTTLE|BLOCK|ACTIVATE|EXPIRE|AT)$/;
const REGO_KW = /^(package|import|default|not|some|in|allow|true|false)$/;

function highlight(lang: string, text: string): ReactNode[] {
  return text.split("\n").map((line, i) => {
    const t = line.trimStart();
    if ((lang === "dsl" || lang === "rego") && t.startsWith("#")) {
      return <div key={i} className="text-[#6F8F95]">{line || " "}</div>;
    }
    const parts = line.split(/("(?:[^"\\]|\\.)*"|\b\d[\d.,:]*\b|[A-Za-z_][A-Za-z0-9_]*)/g);
    return (
      <div key={i}>
        {parts.map((p, j) => {
          if (!p) return null;
          if (p.startsWith('"')) {
            const isKey = lang === "json" && /^\s*:/.test(parts.slice(j + 1).join(""));
            return <span key={j} className={isKey ? "text-[#8FB8FF]" : "text-[#F2C078]"}>{p}</span>;
          }
          if (/^\d/.test(p)) return <span key={j} className="text-[#8FB8FF]">{p}</span>;
          if ((lang === "dsl" && DSL_KW.test(p)) || (lang === "rego" && REGO_KW.test(p)) || (lang === "json" && /^(true|false|null)$/.test(p)))
            return <span key={j} className="text-accent-300">{p}</span>;
          return <span key={j}>{p}</span>;
        })}
        {line === "" && " "}
      </div>
    );
  });
}

export function CodePanel({ tabs, issues, extra }: { tabs: CodeTab[]; issues: Issue[]; extra?: { id: string; label: string; body: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const [copied, setCopied] = useState(false);
  const all = [...(extra ?? []), ...tabs.map((t) => ({ id: t.id, label: t.label, body: null as ReactNode }))];
  const cur = tabs.find((t) => t.id === active);
  const showIssues = active === "__issues";
  const errors = issues.filter((i) => i.level === "error").length;
  const warns = issues.filter((i) => i.level === "warn").length;

  const copy = async () => {
    if (!cur) return;
    try {
      await navigator.clipboard.writeText(cur.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };
  const download = () => {
    if (!cur) return;
    const ext = cur.lang === "json" ? "json" : cur.lang === "rego" ? "rego" : cur.lang === "dsl" ? "policy" : "txt";
    const url = URL.createObjectURL(new Blob([cur.text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cur.id}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const extraBody = extra?.find((x) => x.id === active)?.body;

  return (
    <div className="flex flex-col h-full min-h-0 bg-surface">
      <div className="flex items-center gap-1 px-3 border-b border-border overflow-x-auto">
        {all.map((t) => (
          <button key={t.id} onClick={() => setActive(t.id)} className={clsx("px-3 h-9 text-[13px] font-medium border-b-2 -mb-px whitespace-nowrap", active === t.id ? "border-accent-600 text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary")}>
            {t.label}
          </button>
        ))}
        <button onClick={() => setActive("__issues")} className={clsx("px-3 h-9 text-[13px] font-medium border-b-2 -mb-px inline-flex items-center gap-1.5 whitespace-nowrap", showIssues ? "border-accent-600 text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary")}>
          Validation
          {errors > 0 && <span className="px-1.5 rounded-full bg-status-down text-white text-[10px] font-semibold">{errors}</span>}
          {errors === 0 && warns > 0 && <span className="px-1.5 rounded-full bg-status-degraded text-white text-[10px] font-semibold">{warns}</span>}
          {errors === 0 && warns === 0 && <span className="h-2 w-2 rounded-full bg-status-healthy" />}
        </button>
        <div className="ml-auto flex items-center gap-1 pl-2">
          {cur && (
            <>
              <button onClick={copy} className="h-7 px-2 rounded-md text-xs font-medium text-text-secondary hover:bg-surface-muted inline-flex items-center gap-1">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}</button>
              <button onClick={download} className="h-7 px-2 rounded-md text-xs font-medium text-text-secondary hover:bg-surface-muted inline-flex items-center gap-1"><Download size={13} /> Download</button>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {showIssues ? (
          <ul className="p-3 space-y-1.5">
            {issues.map((i, k) => (
              <li key={k} className="flex items-start gap-2 text-[13px]">
                <span className={clsx("mt-1.5 h-2 w-2 rounded-full shrink-0", i.level === "error" ? "bg-status-down" : i.level === "warn" ? "bg-status-degraded" : "bg-status-info")} />
                <span className="text-text-primary">{i.msg}</span>
                {i.nodeId && <span className="font-mono text-[11px] text-text-tertiary">{BY_KIND[i.nodeId] ? "" : i.nodeId}</span>}
              </li>
            ))}
            {!issues.length && <li className="text-sm text-text-secondary">No issues found.</li>}
          </ul>
        ) : extraBody ? (
          extraBody
        ) : cur ? (
          <pre className="bg-ink-800 text-text-inverse text-[12.5px] leading-relaxed font-mono p-4 min-h-full">{highlight(cur.lang, cur.text)}</pre>
        ) : null}
      </div>
    </div>
  );
}

export function Waterfall({ graph, totalMs, onSelect, selectedId }: { graph: Graph; totalMs: number; onSelect: (id: string) => void; selectedId?: string }) {
  const rows = graph.nodes.filter((n) => n.meta && n.meta.status !== "skip").sort((a, b) => a.meta!.startMs - b.meta!.startMs);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="p-3 min-w-[560px]">
      <div className="grid grid-cols-[170px_1fr_64px] gap-2 text-[10px] uppercase tracking-wide text-text-tertiary mb-1">
        <span>Stage</span>
        <div className="relative h-4">
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2 font-mono" style={{ left: `${t * 100}%`, ...(t === 0 ? { transform: "none" } : t === 1 ? { transform: "translateX(-100%)" } : {}) }}>{Math.round(totalMs * t)}ms</span>
          ))}
        </div>
        <span className="text-right">Time</span>
      </div>
      {rows.map((n) => {
        const m = n.meta!;
        const def = BY_KIND[n.kind];
        return (
          <button key={n.id} onClick={() => onSelect(n.id)} className={clsx("w-full grid grid-cols-[170px_1fr_64px] gap-2 items-center py-1 rounded text-left hover:bg-surface-subtle", selectedId === n.id && "bg-accent-50")}>
            <span className="text-[12.5px] text-text-primary truncate">{def?.label}</span>
            <span className="relative h-4 bg-surface-muted rounded">
              <span
                className="absolute top-0.5 bottom-0.5 rounded"
                style={{ left: `${(m.startMs / totalMs) * 100}%`, width: `${Math.max(0.8, (m.ms / totalMs) * 100)}%`, background: m.status === "error" ? "#DC3B3B" : m.status === "warn" ? "#D98A15" : "#00B876" }}
              />
            </span>
            <span className="text-right font-mono text-[11.5px] text-text-secondary">{m.ms} ms</span>
          </button>
        );
      })}
    </div>
  );
}
