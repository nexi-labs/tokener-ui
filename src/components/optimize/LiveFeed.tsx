"use client";

import clsx from "clsx";
import { Pause, Play, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { APPS } from "@/lib/optimize/data";
import { SAMPLE_PROMPTS } from "@/lib/optimize/samples";
import { optimize, type Run } from "@/lib/optimize/stages";

/** Which sample prompts stand in for each application's traffic. */
const TRAFFIC: Record<string, string[]> = {
  support: ["support-email", "rag-context"], contracts: ["long-report"], review: ["orders-json"], search: ["rag-context", "web-page"], marketing: ["long-report", "web-page"],
};
const MODEL: Record<string, string> = { support: "default-chat", contracts: "fast-reasoning", review: "fast-reasoning", search: "default-chat", marketing: "default-chat" };

type Row = { n: number; at: string; app: string; appId: string; mode: string; alias: string; cache: "exact" | "semantic" | null; before: number; after: number; ms: number; run: Run | null };

function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * A stream of sample requests. Each one is a sample prompt run through the same stages the gateway uses, with the policy of the application it
 * stands in for, and the time is measured for real in this browser. The arrival, the choice of application and the cache hits are simulated.
 */
export function LiveFeed() {
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(true);
  const [sel, setSel] = useState<number | null>(null);
  const [totals, setTotals] = useState({ n: 0, before: 0, after: 0, hits: 0 });
  const rand = useRef(rng(7)); const counter = useRef(0);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const r = rand.current; const app = APPS[Math.floor(r() * APPS.length)];
      const ids = TRAFFIC[app.id], pickId = ids[Math.floor(r() * ids.length)], sample = SAMPLE_PROMPTS.find((s) => s.id === pickId)!;
      const roll = r(); const cache: Row["cache"] = app.cache && roll < 0.08 ? "exact" : app.semantic && roll < 0.13 ? "semantic" : null;
      const n = ++counter.current;
      let row: Row;
      if (cache) {
        const base = optimize(sample.text, sample.question, "off").before;
        row = { n, at: new Date().toLocaleTimeString("en-GB"), app: app.name, appId: app.id, mode: app.mode, alias: MODEL[app.id], cache, before: base, after: 0, ms: 0.2, run: null };
      } else {
        const t0 = performance.now(); const run = optimize(sample.text, sample.question, app.mode, app.stages); const ms = performance.now() - t0;
        row = { n, at: new Date().toLocaleTimeString("en-GB"), app: app.name, appId: app.id, mode: app.mode, alias: MODEL[app.id], cache: null, before: run.before, after: run.after, ms, run };
      }
      setRows((cur) => [row, ...cur].slice(0, 40));
      setTotals((t) => ({ n: t.n + 1, before: t.before + row.before, after: t.after + row.after, hits: t.hits + (cache ? 1 : 0) }));
    };
    const id = setInterval(tick, 1200);
    return () => clearInterval(id);
  }, [running]);

  const saved = totals.before ? (1 - totals.after / totals.before) * 100 : 0;
  const shown = rows.slice(0, 9), detail = rows.find((r) => r.n === sel) ?? null;

  return (
    <Card>
      <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap border-b border-border">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><h3 className="text-sm font-semibold">Live requests</h3>
            <span className={clsx("inline-flex items-center gap-1.5 text-[11px]", running ? "text-status-healthy" : "text-text-tertiary")}><span className={clsx("h-1.5 w-1.5 rounded-full", running ? "bg-status-healthy" : "bg-text-tertiary")} />{running ? "Streaming" : "Paused"}</span></div>
          <p className="text-xs text-text-tertiary mt-0.5">Each row is a request as it passes through the gateway. Select one to see what every stage did to it.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setRunning(!running)}>{running ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Resume</>}</Button>
          <Button onClick={() => { setRows([]); setTotals({ n: 0, before: 0, after: 0, hits: 0 }); setSel(null); }}><Trash2 size={14} /> Clear</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border text-xs">
        {[["Requests", fmt(totals.n)], ["Tokens before", fmt(totals.before)], ["Tokens sent", fmt(totals.after)], ["Saved", `${saved.toFixed(1)}%`]].map(([k, v]) => (
          <div key={k} className="bg-surface px-5 py-3"><div className="text-text-tertiary">{k}</div><div className="text-base font-semibold tabular-nums text-text-primary">{v}</div></div>))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface-subtle border-y border-border text-text-tertiary"><tr>
            {["Time", "Application", "Policy", "Route", "Before", "Sent", "Removed", "What happened", "Time added"].map((h, i) => <th key={h} className={clsx("px-3 py-2 font-medium text-left uppercase tracking-wide text-[10px] whitespace-nowrap", [4, 5, 6, 8].includes(i) && "text-right")}>{h}</th>)}
          </tr></thead>
          <tbody aria-live="off">
            {shown.length === 0 && <tr><td colSpan={9} className="px-5 py-8 text-center text-text-tertiary">Waiting for requests.</td></tr>}
            {shown.map((r) => {
              const pct = r.before ? ((r.before - r.after) / r.before) * 100 : 0;
              const stages = r.run?.stages.filter((s) => s.applied && s.before - s.after > 0).map((s) => s.label) ?? [];
              return (
                <tr key={r.n} onClick={() => setSel(r.n)} className={clsx("border-b border-border cursor-pointer hover:bg-surface-subtle", sel === r.n && "bg-accent-50/50")}>
                  <td className="px-3 py-2 tabular-nums text-text-tertiary whitespace-nowrap">{r.at}</td>
                  <td className="px-3 py-2 whitespace-nowrap"><button className="font-medium text-text-primary hover:underline" onClick={() => setSel(r.n)}>{r.app}</button></td>
                  <td className="px-3 py-2 text-text-secondary">{r.mode}</td>
                  <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{r.alias}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(r.before)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(r.after)}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap"><span className="inline-flex items-center gap-2"><span aria-hidden className="inline-block h-1.5 w-12 rounded-full bg-surface-muted overflow-hidden"><span className="block h-full bg-accent-600" style={{ width: `${pct}%` }} /></span>{pct.toFixed(0)}%</span></td>
                  <td className="px-3 py-2">{r.cache ? <Badge tone="info">{r.cache === "exact" ? "Exact cache hit" : "Semantic cache hit"}</Badge> : stages.length ? <span className="text-text-secondary">{stages.join(", ")}</span> : <span className="text-text-tertiary">Sent unchanged</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-tertiary whitespace-nowrap">{r.ms < 0.05 ? "<0.1" : r.ms.toFixed(1)} ms</td>
                </tr>);
            })}
          </tbody>
        </table>
      </div>
      {detail && (
        <div className="px-5 py-4 border-t border-border bg-surface-subtle/60">
          <div className="text-[13px] font-medium">Request {detail.n} &middot; {detail.app}</div>
          {detail.run ? (
            <div className="mt-2 grid sm:grid-cols-2 gap-x-8 gap-y-1 text-xs">
              {detail.run.stages.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 border-b border-border/60 py-1">
                  <span className={clsx(s.applied ? "text-text-primary" : "text-text-tertiary")}>{s.label}</span>
                  <span className="text-text-secondary tabular-nums text-right">{s.applied ? (s.before - s.after > 0 ? `-${fmt(s.before - s.after)} tokens` : "no change") : s.skipped}</span>
                </div>))}
              <div className="sm:col-span-2 pt-2 text-text-secondary">Critical details present in what was sent: <span className="font-medium text-text-primary tabular-nums">{detail.run.critical.kept} of {detail.run.critical.total}</span>.</div>
            </div>
          ) : <p className="text-xs text-text-secondary mt-1">Served from the {detail.cache} cache. The provider was not called, so no tokens were sent.</p>}
        </div>)}
      <p className="px-5 py-3 text-xs text-text-tertiary border-t border-border">Sample traffic. The stages and the time added are real and run in this browser. Which application sends a request, and which requests hit the cache, are simulated.</p>
    </Card>
  );
}
