"use client";

import { Link2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { integrationById } from "@/lib/mlops/catalog";
import { OP_BY_KIND, PORT_COLOR } from "@/lib/mlops/operators";
import { canConnect, effectiveConfig, removeEdge, type PipelineSpec, type SpecNode } from "@/lib/mlops/spec";
import type { Connection } from "@/lib/mlops/types";
import { HealthBadge, Notice } from "./ui";

const SRC_LABEL = { default: "default", override: "override", inherited: "inherited", pipeline: "pipeline" } as const;

type Props = {
  spec: PipelineSpec;
  node: SpecNode;
  connections: Connection[];
  readOnly?: boolean;
  onChange: (patch: Partial<SpecNode>) => void;
  onConnect: (from: string, fromPort: string, to: string, toPort: string) => void;
  onSpec: (s: PipelineSpec) => void;
  onDelete: () => void;
  showEffective?: boolean;
};

export function NodeConfig({ spec, node, connections, readOnly, onChange, onConnect, onSpec, onDelete, showEffective = true }: Props) {
  const op = OP_BY_KIND[node.operator];
  const [outPort, setOutPort] = useState(op.outputs[0]?.id ?? "");
  const [target, setTarget] = useState("");
  const [secretName, setSecretName] = useState("");
  const [secretRef, setSecretRef] = useState("");
  const eligible = connections.filter((c) => c.env === spec.environment && (!op.targets.length || op.targets.includes(c.integrationId)));
  const other = connections.filter((c) => c.env !== spec.environment && (!op.targets.length || op.targets.includes(c.integrationId)));
  const sel = connections.find((c) => c.id === node.connection);
  const incoming = spec.edges.filter((e) => e.to === node.id), outgoing = spec.edges.filter((e) => e.from === node.id);

  const validPairs = op.outputs.length ? spec.nodes.filter((n) => n.id !== node.id).flatMap((n) => OP_BY_KIND[n.operator].inputs.filter((p) => canConnect(spec, node.id, outPort, n.id, p.id).ok).map((p) => ({ n, p }))) : [];
  const setCfg = (k: string, v: any) => onChange({ config: { ...node.config, [k]: v } });

  return (
    <div className="space-y-5 text-[13px]">
      <section className="space-y-3">
        <Field label="Name"><Input value={node.name} disabled={readOnly} onChange={(e) => onChange({ name: e.target.value })} /></Field>
        <p className="text-xs text-text-tertiary">{op.desc}</p>
        <div className="text-[11px] text-text-tertiary font-code">operator {node.operator}, schema {node.schemaVersion}, adapter {op.adapter}</div>
        {op.executable === "none" && <Notice tone="warn" title="Draw only">No execution adapter exists for this operator in this build. You can design with it, but a run is blocked.</Notice>}
      </section>

      {op.needsConnection && (
        <section>
          <Field label="Connection" hint={op.targets.length ? `Supported: ${op.targets.map((t) => integrationById(t)?.name ?? t).join(", ")}. Only ${spec.environment} connections are listed.` : undefined}>
            <Select value={node.connection ?? ""} disabled={readOnly} onChange={(e) => onChange({ connection: e.target.value || undefined })}>
              <option value="">Choose a connection</option>
              {eligible.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.health === "healthy" ? "healthy" : c.health})</option>)}
            </Select>
          </Field>
          {sel && <div className="mt-2 flex items-center gap-2 text-xs text-text-secondary"><HealthBadge h={sel.health} /><span>{integrationById(sel.integrationId)?.name}, {sel.permissions}</span></div>}
          {!eligible.length && <div className="mt-2"><Notice tone="warn">No {spec.environment} connection supports this operator{other.length ? `. ${other.length} exist in other environments and cannot be used here` : ""}. Add one under Integrations.</Notice></div>}
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Configuration</h3>
        {op.params.map((p) => (
          p.type === "toggle" ? <Toggle key={p.key} checked={!!node.config[p.key]} onChange={(v) => !readOnly && setCfg(p.key, v)} label={p.label} description={p.help} /> :
          <Field key={p.key} label={p.label} hint={p.help}>
            {p.type === "select" ? <Select disabled={readOnly} value={String(node.config[p.key] ?? "")} onChange={(e) => setCfg(p.key, e.target.value)}>{(p.options ?? []).map((o) => <option key={o}>{o}</option>)}</Select>
              : p.type === "textarea" ? <textarea disabled={readOnly} rows={5} value={String(node.config[p.key] ?? "")} onChange={(e) => setCfg(p.key, e.target.value)} className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:opacity-60" />
              : <Input disabled={readOnly} type={p.type === "number" ? "number" : "text"} min={p.type === "number" ? 0 : undefined} value={String(node.config[p.key] ?? "")} onChange={(e) => setCfg(p.key, p.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} />}
          </Field>
        ))}
        {!op.params.length && <p className="text-xs text-text-tertiary">No settings.</p>}
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Reliability</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Retries"><Input type="number" min={0} max={10} disabled={readOnly} value={node.retry?.max ?? op.retry.max} onChange={(e) => onChange({ retry: { max: Number(e.target.value), backoffMs: node.retry?.backoffMs ?? op.retry.backoffMs } })} /></Field>
          <Field label="Backoff (ms)" hint="Exponential, with jitter"><Input type="number" min={0} disabled={readOnly} value={node.retry?.backoffMs ?? op.retry.backoffMs} onChange={(e) => onChange({ retry: { max: node.retry?.max ?? op.retry.max, backoffMs: Number(e.target.value) } })} /></Field>
          <Field label="Timeout (s)"><Input type="number" min={0} disabled={readOnly} value={node.timeoutSec ?? op.timeoutSec} onChange={(e) => onChange({ timeoutSec: Number(e.target.value) })} /></Field>
          <Field label="On failure"><Select disabled={readOnly} value={node.onFailure ?? op.onFailure} onChange={(e) => onChange({ onFailure: e.target.value as SpecNode["onFailure"] })}><option value="stop">Stop</option><option value="continue">Continue</option><option value="rollback">Roll back</option></Select></Field>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Secret references</h3>
        {Object.entries(node.secretRefs ?? {}).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 text-xs"><span className="font-medium w-24 truncate">{k}</span><span className="font-code text-text-secondary truncate flex-1">{v}</span>
            {!readOnly && <button aria-label={`Remove ${k}`} className="text-text-tertiary hover:text-status-down" onClick={() => { const { [k]: _, ...rest } = node.secretRefs!; onChange({ secretRefs: rest }); }}><Trash2 size={13} /></button>}</div>
        ))}
        {!readOnly && (
          <div className="flex gap-2"><Input placeholder="name" value={secretName} onChange={(e) => setSecretName(e.target.value)} className="w-28" /><Input placeholder="secretref://vault/..." value={secretRef} onChange={(e) => setSecretRef(e.target.value)} />
            <Button variant="secondary" aria-label="Add secret reference" onClick={() => { if (!secretName) return; onChange({ secretRefs: { ...(node.secretRefs ?? {}), [secretName]: secretRef } }); setSecretName(""); setSecretRef(""); }}><Plus size={14} /></Button></div>
        )}
        <p className="text-xs text-text-tertiary">Only references are stored. A value that is not a secretref:// reference is rejected by validation.</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Connections between operators</h3>
        {[...incoming.map((e) => ({ e, dir: "from" as const, other: e.from, port: e.toPort })), ...outgoing.map((e) => ({ e, dir: "to" as const, other: e.to, port: e.fromPort }))].map(({ e, dir, other: o, port }) => (
          <div key={e.id} className="flex items-center gap-2 text-xs"><span className="h-2 w-2 rounded-full shrink-0" style={{ background: PORT_COLOR[(dir === "to" ? op.outputs : op.inputs).find((p) => p.id === port)?.type ?? "signal"] }} /><span className="flex-1 truncate">{dir === "from" ? "from" : "to"} {spec.nodes.find((n) => n.id === o)?.name} <span className="text-text-tertiary">({port})</span></span>
            {!readOnly && <button aria-label="Remove connection" className="text-text-tertiary hover:text-status-down" onClick={() => onSpec(removeEdge(spec, e.id))}><Trash2 size={13} /></button>}</div>
        ))}
        {!incoming.length && !outgoing.length && <p className="text-xs text-text-tertiary">Not connected yet.</p>}
        {!readOnly && op.outputs.length > 0 && (
          <div className="rounded-md border border-border p-2.5 space-y-2 bg-surface-subtle">
            <div className="text-xs font-medium flex items-center gap-1.5"><Link2 size={12} /> Connect (no pointer needed)</div>
            <div className="grid grid-cols-2 gap-2">
              <Select aria-label="Output port" value={outPort} onChange={(e) => { setOutPort(e.target.value); setTarget(""); }}>{op.outputs.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.type})</option>)}</Select>
              <Select aria-label="Target input" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">To...</option>{validPairs.map(({ n, p }) => <option key={`${n.id}:${p.id}`} value={`${n.id}:${p.id}`}>{n.name}: {p.label}</option>)}</Select>
            </div>
            <Button variant="secondary" disabled={!target} onClick={() => { const [t, p] = target.split(":"); onConnect(node.id, outPort, t, p); setTarget(""); }}>Connect</Button>
            {!validPairs.length && <p className="text-xs text-text-tertiary">No compatible input is free for this output.</p>}
          </div>
        )}
      </section>

      {showEffective && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-2">Effective configuration</h3>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs"><tbody>
              {effectiveConfig(spec, node).map((r) => (
                <tr key={r.key} className="border-b border-border last:border-0"><td className="px-2.5 py-1.5 text-text-tertiary w-[38%]">{r.label}</td><td className="px-2.5 py-1.5 font-code break-all">{r.value || "empty"}</td>
                  <td className="px-2.5 py-1.5 text-right"><span className={r.source === "override" ? "text-[#2557B8]" : "text-text-tertiary"}>{SRC_LABEL[r.source]}</span></td></tr>
              ))}
            </tbody></table>
          </div>
        </section>
      )}

      {!readOnly && <Button variant="secondary" className="text-status-down" onClick={onDelete}><Trash2 size={14} /> Remove operator</Button>}
    </div>
  );
}
