"use client";

import clsx from "clsx";
import { Copy, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { BY_KIND } from "./catalog";
import { NodeIcon } from "./icons";
import { EDGE_STYLE, TONE, type EdgeType, type GEdge, type GNode, type Issue, type Mode, type ParamDef } from "./types";

function ParamField({ def, value, onChange }: { def: ParamDef; value: any; onChange: (v: any) => void }) {
  if (def.type === "toggle")
    return (
      <div className="border-t border-border first:border-0">
        <Toggle checked={!!value} onChange={onChange} label={def.label} description={def.help} />
      </div>
    );
  return (
    <Field label={def.label} hint={def.help}>
      {def.type === "select" ? (
        <Select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          {def.options!.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </Select>
      ) : (
        <Input
          type={def.type === "number" ? "number" : def.type === "time" ? "time" : def.type === "datetime" ? "datetime-local" : "text"}
          value={value ?? ""}
          placeholder={def.placeholder}
          onChange={(e) => onChange(def.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
        />
      )}
    </Field>
  );
}

export function NodeInspector({
  node, mode, issues, onParam, onDelete, onDuplicate, onClose,
}: {
  node: GNode; mode: Mode; issues: Issue[];
  onParam: (key: string, v: any) => void; onDelete: () => void; onDuplicate: () => void; onClose: () => void;
}) {
  const def = BY_KIND[node.kind];
  const isTrace = mode === "trace";
  const [tab, setTab] = useState<"config" | "span" | "about">(isTrace && node.meta ? "span" : "config");
  const tone = TONE[def.tone];
  const tabs: { id: "config" | "span" | "about"; label: string }[] = [
    ...(isTrace && node.meta ? [{ id: "span" as const, label: "Span" }] : []),
    { id: "config", label: "Configure" },
    { id: "about", label: "About" },
  ];
  const mine = issues.filter((i) => i.nodeId === node.id);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <span className={clsx("h-9 w-9 rounded-md grid place-items-center shrink-0", tone.tile, tone.text)}><NodeIcon icon={def.icon} size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text-primary truncate">{def.label}</div>
          <div className="text-[11px] font-mono text-text-tertiary truncate">{node.id}</div>
        </div>
        <button onClick={onClose} aria-label="Close inspector" className="h-8 w-8 grid place-items-center rounded-md text-text-tertiary hover:bg-surface-muted"><X size={16} /></button>
      </div>
      <div className="flex gap-1 px-3 pt-2 border-b border-border">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={clsx("px-3 h-8 text-[13px] font-medium border-b-2 -mb-px", tab === t.id ? "border-accent-600 text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary")}>{t.label}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {mine.length > 0 && (
          <div className="space-y-1.5">
            {mine.map((i, k) => (
              <div key={k} className={clsx("text-xs rounded-md px-2.5 py-2 border", i.level === "error" ? "bg-[#FCE9E9] border-status-down/30 text-[#8F2020]" : i.level === "warn" ? "bg-[#FBF1DE] border-status-degraded/30 text-[#7A4A04]" : "bg-surface-subtle border-border text-text-secondary")}>{i.msg}</div>
            ))}
          </div>
        )}
        {tab === "config" && (
          <>
            {def.params.length === 0 && <p className="text-sm text-text-tertiary">This node has no settings.</p>}
            {def.params.map((p) => (
              <ParamField key={p.key} def={p} value={node.params[p.key]} onChange={(v) => onParam(p.key, v)} />
            ))}
          </>
        )}
        {tab === "span" && node.meta && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Status", node.meta.status],
                ["Start", `+${node.meta.startMs} ms`],
                ["Duration", `${node.meta.ms} ms`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md border border-border px-2 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-text-tertiary">{k}</div>
                  <div className={clsx("text-sm font-semibold mt-0.5", v === "error" ? "text-status-down" : v === "warn" ? "text-[#9A5F05]" : "text-text-primary")}>{v}</div>
                </div>
              ))}
            </div>
            {node.meta.note && <p className="text-sm text-text-primary">{node.meta.note}</p>}
            <div className="rounded-md border border-border divide-y divide-border">
              {Object.entries(node.meta.attrs).length === 0 && <div className="px-3 py-2 text-xs text-text-tertiary">No attributes recorded.</div>}
              {Object.entries(node.meta.attrs).map(([k, v]) => (
                <div key={k} className="px-3 py-2 grid grid-cols-5 gap-2 text-xs">
                  <span className="col-span-2 font-mono text-text-tertiary break-all">{k}</span>
                  <span className="col-span-3 font-mono text-text-primary break-all">{v}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === "about" && (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary leading-relaxed">{def.about}</p>
            <div className="text-xs text-text-tertiary">
              <span className="font-semibold text-text-secondary">Group:</span> {def.group}
              {def.planned && <span className="ml-2 text-[#6B3FD4] font-semibold">planned</span>}
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2 p-3 border-t border-border">
        {!isTrace && (
          <>
            <button onClick={onDuplicate} disabled={!!def.singleton} className="flex-1 h-9 rounded-md border border-border-strong text-[13px] font-medium inline-flex items-center justify-center gap-1.5 hover:bg-surface-subtle disabled:opacity-40"><Copy size={14} /> Duplicate</button>
            <button onClick={onDelete} className="flex-1 h-9 rounded-md border border-status-down/40 text-status-down text-[13px] font-medium inline-flex items-center justify-center gap-1.5 hover:bg-[#FCE9E9]"><Trash2 size={14} /> Delete</button>
          </>
        )}
      </div>
    </div>
  );
}

export function EdgeInspector({
  edge, from, to, locked, onType, onLabel, onDelete, onClose,
}: {
  edge: GEdge; from: string; to: string; locked: boolean;
  onType: (t: EdgeType) => void; onLabel: (s: string) => void; onDelete: () => void; onClose: () => void;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text-primary">Connection</div>
          <div className="text-[11px] font-mono text-text-tertiary truncate">{from} to {to}</div>
        </div>
        <button onClick={onClose} aria-label="Close inspector" className="h-8 w-8 grid place-items-center rounded-md text-text-tertiary hover:bg-surface-muted"><X size={16} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Field label="Type">
          <Select value={edge.type} disabled={locked} onChange={(e) => onType(e.target.value as EdgeType)}>
            {Object.entries(EDGE_STYLE).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </Select>
        </Field>
        <svg width="100%" height="14" aria-hidden>
          <line x1="0" y1="7" x2="100%" y2="7" stroke={EDGE_STYLE[edge.type].color} strokeWidth="2.5" strokeDasharray={EDGE_STYLE[edge.type].dash} />
        </svg>
        <Field label="Label" hint="Shown on the canvas next to the connection.">
          <Input value={edge.label ?? ""} disabled={locked} onChange={(e) => onLabel(e.target.value)} placeholder="optional" />
        </Field>
      </div>
      {!locked && (
        <div className="p-3 border-t border-border">
          <button onClick={onDelete} className="w-full h-9 rounded-md border border-status-down/40 text-status-down text-[13px] font-medium inline-flex items-center justify-center gap-1.5 hover:bg-[#FCE9E9]"><Trash2 size={14} /> Delete connection</button>
        </div>
      )}
    </div>
  );
}
