"use client";

import clsx from "clsx";
import { useEffect, useRef } from "react";
import { Braces, CircleSlash, Database, Eraser, EyeOff, FileText, Plus, Rows3, ShieldCheck, Sigma, Sparkles, Split, Type, Cpu, ArrowRightToLine, Layers } from "lucide-react";
import { fmtInt, fmtRows, fmtBytes, sinkLabel } from "@/components/refinery/bits";
import { STEP_BY_OP, describe, type StepGroup } from "@/lib/refinery/steps";
import { FUNCTION_BY_ID } from "@/lib/refinery/catalog";
import type { Connection, Dataset, OutputSink, Step } from "@/lib/refinery/types";
import type { StepResult } from "@/lib/refinery/steps";

/** One colour and one icon per group of steps, so a long pipeline reads by shape and colour before it is read by word. */
export const GROUP_STYLE: Record<StepGroup, { color: string; Icon: typeof Eraser }> = {
  "Clean": { color: "#0E9F6E", Icon: Eraser },
  "Missing values": { color: "#D97706", Icon: CircleSlash },
  "Types and schema": { color: "#2563EB", Icon: Type },
  "Rows": { color: "#0891B2", Icon: Rows3 },
  "Quality": { color: "#DC2626", Icon: ShieldCheck },
  "Privacy": { color: "#7C3AED", Icon: EyeOff },
  "Feature engineering": { color: "#DB2777", Icon: Sigma },
  "Documents": { color: "#65A30D", Icon: FileText },
  "Functions and connectors": { color: "#475569", Icon: Braces },
  "AI": { color: "#4F46E5", Icon: Sparkles },
  "Training sets": { color: "#0D9488", Icon: Split },
};

const NW = 200, NH = 110, GAP = 68, PADX = 28, SW = 164, SH = 40, KW = 214, KH = 60;

/**
 * The recipe as a flow: the source on the left, one node per step in order, the outputs fanning out on the right. A function or connection used by a step
 * shows as a small node feeding it from above. Click a node to configure it, click a plus between nodes to insert a step there.
 */
export function PipelineCanvas({ ds, steps, results, outputs, connections, sel, onSelect, onInsert, onOutputs }: {
  ds: Dataset | undefined; steps: Step[]; results: StepResult[] | undefined; outputs: OutputSink[]; connections: Connection[];
  sel: number | null; onSelect: (i: number) => void; onInsert: (after: number) => void; onOutputs: () => void;
}) {
  const n = steps.length;
  const hasSide = steps.some((s) => s.op === "function" || s.op === "connector_lookup" || STEP_BY_OP.get(s.op)?.ai);
  const TOP = hasSide ? 104 : 36;
  const sinkCount = Math.max(1, outputs.length);
  const sinkX = PADX + (n + 1) * (NW + GAP);
  const sinksH = sinkCount * (KH + 14) - 14;
  const midY = TOP + NH / 2;
  const sinkTop = Math.max(TOP - 20, midY - sinksH / 2);
  const W = sinkX + KW + PADX; const H = Math.max(TOP + NH + 36, sinkTop + sinksH + 36);
  const nodeX = (k: number) => PADX + (k + 1) * (NW + GAP); // k = step index; source is -1
  const box = useRef<HTMLDivElement>(null);
  const want = useRef(false);
  useEffect(() => { if (!want.current) return; want.current = false; if (sel === null || !box.current) return; const x = nodeX(sel); const el = box.current; if (x < el.scrollLeft + 20 || x + NW > el.scrollLeft + el.clientWidth - 20) el.scrollTo({ left: Math.max(0, x - 80), behavior: "smooth" }); }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const side = (s: Step) => {
    if (s.op === "function") { const f = FUNCTION_BY_ID.get(String(s.params.function)); return { label: f?.name ?? "Choose a function", sub: "Serverless function", Icon: Braces }; }
    if (s.op === "connector_lookup") { const c = connections.find((x) => x.id === s.params.connection); return { label: c?.name ?? "Choose a connection", sub: String(s.params.source || "Lookup source"), Icon: Database }; }
    if (STEP_BY_OP.get(s.op)?.ai) return { label: String(s.params.model ?? "model").replace("alias:", ""), sub: "Model through the gateway", Icon: Cpu };
    return null;
  };
  const line = "#9AA7AB";

  return (
    <div ref={box} className="overflow-x-auto overflow-y-hidden rounded-b-lg" style={{ background: "radial-gradient(circle, rgb(var(--c-border, 210 218 220) / 0.55) 1px, transparent 1px) 0 0 / 22px 22px" }}>
      <div className="relative" style={{ width: W, height: H }}>
        <svg width={W} height={H} className="absolute inset-0 pointer-events-none" aria-hidden>
          <defs><marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill={line} /></marker></defs>
          {/* source and steps in a line */}
          {Array.from({ length: n }, (_, k) => <line key={k} x1={nodeX(k - 1) + NW} y1={midY} x2={nodeX(k)} y2={midY} stroke={line} strokeWidth={1.5} markerEnd="url(#arr)" />)}
          {/* last step to each output */}
          {Array.from({ length: sinkCount }, (_, k) => { const x1 = nodeX(n - 1) + NW, y1 = midY, x2 = sinkX, y2 = sinkTop + k * (KH + 14) + KH / 2; const dx = (x2 - x1) / 2; return <path key={k} d={`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`} fill="none" stroke={line} strokeWidth={1.5} strokeDasharray={outputs.length ? undefined : "4 4"} markerEnd="url(#arr)" />; })}
          {/* side inputs */}
          {steps.map((s, k) => side(s) ? <line key={s.id} x1={nodeX(k) + NW / 2} y1={12 + SH} x2={nodeX(k) + NW / 2} y2={TOP} stroke={line} strokeWidth={1.5} strokeDasharray="3 3" markerEnd="url(#arr)" /> : null)}
        </svg>

        {/* source */}
        <div className="absolute rounded-lg border border-border-strong bg-surface px-3.5 py-3" style={{ left: nodeX(-1), top: TOP, width: NW, height: NH }}>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-text-tertiary"><Layers size={13} /> Source</div>
          <div className="text-[13px] font-semibold truncate mt-1">{ds?.name ?? "Choose a dataset"}</div>
          <div className="text-xs text-text-secondary mt-0.5 tabular-nums">{ds ? `${fmtRows(ds.totalRows)} rows, ${fmtBytes(ds.sizeBytes)}` : ""}</div>
          <div className="text-[11px] text-text-tertiary uppercase">{ds?.format}</div>
        </div>

        {/* inserts */}
        {Array.from({ length: n + 1 }, (_, k) => { const x = nodeX(k - 1) + NW + GAP / 2; return <button key={k} type="button" aria-label={k === 0 ? "Insert a step first" : `Insert a step after step ${k}`} title="Insert a step here" onClick={() => onInsert(k - 1)} className="absolute z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border-strong bg-surface text-text-secondary hover:bg-[#07191E] hover:text-[#02F5A1] hover:border-[#07191E] grid place-items-center shadow-sm" style={{ left: k === n ? x : x, top: midY }}><Plus size={13} /></button>; })}

        {/* steps */}
        {steps.map((s, k) => {
          const d = STEP_BY_OP.get(s.op); const g = d ? GROUP_STYLE[d.group] : GROUP_STYLE.Clean; const r = results?.[k]; const on = sel === k; const sd = side(s); const bad = !!r?.error;
          return (
            <div key={s.id}>
              {sd && <div className="absolute rounded-md border border-border bg-surface px-2.5 py-1.5 flex items-center gap-2" style={{ left: nodeX(k) + NW / 2 - SW / 2, top: 12, width: SW, height: SH }} title={sd.sub}>
                <sd.Icon size={14} style={{ color: g.color }} className="shrink-0" /><div className="min-w-0"><div className="text-[11px] font-medium truncate leading-tight">{sd.label}</div><div className="text-[10px] text-text-tertiary truncate leading-tight">{sd.sub}</div></div>
              </div>}
              <button type="button" onClick={() => { want.current = true; onSelect(k); }} aria-current={on ? "step" : undefined} aria-label={`Step ${k + 1}: ${d?.label ?? s.op}`}
                className={clsx("absolute text-left rounded-lg bg-surface border px-3.5 py-2.5 overflow-hidden transition-shadow", on ? "border-transparent shadow-lg" : "border-border hover:shadow-md", bad && "border-status-down")}
                style={{ left: nodeX(k), top: TOP, width: NW, height: NH, boxShadow: on ? `0 0 0 2px ${g.color}, 0 6px 18px rgba(7,25,30,.14)` : undefined }}>
                <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: g.color }} />
                <div className="flex items-center gap-2"><g.Icon size={14} style={{ color: g.color }} className="shrink-0" /><span className="text-[13px] font-semibold truncate">{d?.label ?? s.op}</span><span className="ml-auto text-[10px] text-text-tertiary tabular-nums">{k + 1}</span></div>
                <div className="text-xs text-text-secondary mt-1.5 line-clamp-2 leading-snug">{describe(s)}</div>
                <div className="absolute left-3.5 right-3 bottom-2.5 text-[10.5px] text-text-tertiary tabular-nums truncate">
                  {bad ? <span className="text-status-down">Needs attention</span> : r?.ai || r?.remote ? (r.ai ? "Model step, runs on the runner" : "Runs on the runner") : r ? `${fmtInt(r.rowsIn)} to ${fmtInt(r.rowsOut)} rows${r.rejected ? `, ${fmtInt(r.rejected)} rejected` : ""}` : ""}
                </div>
              </button>
            </div>
          );
        })}
        {n === 0 && <div className="absolute text-xs text-text-secondary" style={{ left: nodeX(0) + 4, top: midY - 10 }}>No steps yet. Use the plus or the assistant to add the first one.</div>}

        {/* outputs */}
        {Array.from({ length: sinkCount }, (_, k) => { const o = outputs[k]; return (
          <button key={o?.name ?? "none"} type="button" onClick={onOutputs} title="Change outputs in Run settings" className={clsx("absolute text-left rounded-lg px-3.5 py-2.5", o ? "bg-[#07191E] text-white hover:shadow-lg" : "border border-dashed border-border-strong bg-surface text-text-secondary")} style={{ left: sinkX, top: sinkTop + k * (KH + 14), width: KW, height: KH }}>
            {o ? <><div className="flex items-center gap-2"><ArrowRightToLine size={13} className="text-[#02F5A1] shrink-0" /><span className="text-[13px] font-semibold truncate">{o.name}</span><span className="ml-auto text-[10px] uppercase text-white/60">{o.format}</span></div><div className="text-[11px] text-white/70 truncate mt-1">{sinkLabel(o)}</div></> : <div className="text-xs flex items-center gap-2 h-full"><Plus size={13} /> Add an output in Run settings</div>}
          </button>); })}
      </div>
    </div>
  );
}
