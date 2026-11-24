"use client";

import clsx from "clsx";
import { Field, Input, Segmented, Select, Toggle } from "@/components/ui/Form";
import { CARDS, CARD_LABEL, PRESETS, USABLE, estimate, type Method, type Offload, type Optimizer, type PlanInput, type Precision, type Shard } from "@/lib/crucible/memory";
import { gb } from "./bits";

const num = (v: string, min: number, max: number, fallback: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };

export function PlanForm({ value, onChange }: { value: PlanInput; onChange: (v: PlanInput) => void }) {
  const set = (patch: Partial<PlanInput>) => onChange({ ...value, ...patch });
  const preset = PRESETS.find((p) => p.paramsB === value.paramsB && p.layers === value.layers && p.hidden === value.hidden)?.id ?? "custom";
  return (
    <div className="space-y-5">
      <Field label="Model size">
        <Select value={preset} onChange={(e) => { const p = PRESETS.find((x) => x.id === e.target.value); if (p) set({ paramsB: p.paramsB, layers: p.layers, hidden: p.hidden, heads: p.heads, vocab: p.vocab }); }}>
          {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          {preset === "custom" && <option value="custom">Custom</option>}
        </Select>
      </Field>
      <Field label="How it is trained">
        <Segmented<Method> value={value.method} onChange={(method) => set({ method, ...(method !== "full" ? { shard: "none" as Shard, offload: "none" as Offload } : {}) })} options={[{ value: "full", label: "All weights" }, { value: "lora", label: "LoRA" }, { value: "qlora", label: "QLoRA" }]} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Precision"><Select value={value.precision} onChange={(e) => set({ precision: e.target.value as Precision })}><option value="bf16">bf16</option><option value="fp16">fp16</option><option value="fp32">fp32</option></Select></Field>
        <Field label="Optimizer"><Select value={value.optimizer} onChange={(e) => set({ optimizer: e.target.value as Optimizer })}><option value="adamw">AdamW</option><option value="adamw8bit">AdamW, 8 bit</option><option value="adafactor">Adafactor</option><option value="sgd">SGD with momentum</option></Select></Field>
        <Field label="GPU"><Select value={value.gpuGb} onChange={(e) => set({ gpuGb: Number(e.target.value) })}>{CARDS.map((c) => <option key={c} value={c}>{CARD_LABEL[c]}</option>)}</Select></Field>
        <Field label="Number of GPUs"><Input type="number" min={1} max={512} value={value.gpus} onChange={(e) => set({ gpus: Math.round(num(e.target.value, 1, 512, 1)) })} /></Field>
        <Field label="Sequence length"><Input type="number" min={16} max={131072} step={256} value={value.seqLen} onChange={(e) => set({ seqLen: Math.round(num(e.target.value, 16, 131072, 2048)) })} /></Field>
        <Field label="Micro batch for each GPU"><Input type="number" min={1} max={512} value={value.microBatch} onChange={(e) => set({ microBatch: Math.round(num(e.target.value, 1, 512, 1)) })} /></Field>
        <Field label="Sharding" hint={value.method === "full" ? undefined : "Sharding is for full training."}>
          <Select value={value.shard} disabled={value.method !== "full"} onChange={(e) => set({ shard: e.target.value as Shard })}>
            <option value="none">None</option><option value="zero1">ZeRO 1, optimizer</option><option value="zero2">ZeRO 2, plus gradients</option><option value="zero3">ZeRO 3 or FSDP, plus weights</option>
          </Select>
        </Field>
        {value.method !== "full" && <Field label="Share of weights trained" hint="About 0.5 to 2 percent for LoRA ranks 8 to 64."><Input type="number" min={0.001} max={0.2} step={0.005} value={value.trainableFrac} onChange={(e) => set({ trainableFrac: num(e.target.value, 0.001, 0.2, 0.01) })} /></Field>}
      </div>
      <div className="divide-y divide-border border-y border-border">
        <Toggle label="Flash attention" description="Does not store the attention score matrix." checked={value.flash} onChange={(flash) => set({ flash })} />
        <Toggle label="Activation checkpointing" description="Keeps each layer's input and recomputes the rest. About a third more compute." checked={value.checkpointing} onChange={(checkpointing) => set({ checkpointing })} />
        <Toggle label="Offload optimizer to host memory" description="Frees GPU memory and makes each step slower." checked={value.offload === "optimizer"} onChange={(o) => set({ offload: o ? "optimizer" : "none" })} />
      </div>
    </div>
  );
}

const PARTS = [
  { key: "weights", label: "Weights", fill: "var(--chart-s1)" },
  { key: "gradients", label: "Gradients", fill: "var(--chart-s2)" },
  { key: "optimizer", label: "Optimizer state", fill: "var(--chart-s3)" },
  { key: "activations", label: "Activations", fill: "#8E5BD9" },
  { key: "logits", label: "Output logits", fill: "#D98E2B" },
  { key: "overhead", label: "Runtime overhead", fill: "var(--chart-tick)" },
] as const;

/** A stacked bar against the usable memory line, with the same numbers in a table underneath so colour is never the only signal. */
export function BreakdownView({ input }: { input: PlanInput }) {
  const e = estimate(input);
  const cap = Math.max(e.total, input.gpuGb) * 1.04;
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs text-text-tertiary">Estimated for each GPU</div>
          <div className="text-3xl font-semibold tracking-tight tabular-nums text-text-primary">{gb(e.total)}</div>
        </div>
        <div className="text-right">
          <div className={clsx("text-sm font-medium", e.fits ? "text-status-healthy" : "text-status-down")}>{e.fits ? "Fits" : "Does not fit"}</div>
          <div className="text-xs text-text-secondary">{gb(e.usable, 0)} usable of {input.gpuGb} GB{e.fits ? `, ${gb(e.headroom)} to spare` : `, ${gb(-e.headroom)} over`}</div>
        </div>
      </div>
      <div className="relative">
        <div className="flex h-7 rounded-md overflow-hidden border border-border bg-surface-subtle" role="img" aria-label={`Memory by part, ${gb(e.total)} of ${gb(e.usable, 0)} usable`}>
          {PARTS.map((p) => { const v = e[p.key]; return v > 0 ? <div key={p.key} title={`${p.label} ${gb(v)}`} style={{ width: `${(v / cap) * 100}%`, background: p.fill }} /> : null; })}
        </div>
        <div className="absolute top-[-4px] bottom-[-4px] w-px bg-text-primary" style={{ left: `${(e.usable / cap) * 100}%` }} aria-hidden />
        <div className="text-[11px] text-text-tertiary mt-1.5 text-right" style={{ paddingRight: `${100 - (e.usable / cap) * 100}%` }}>Usable limit</div>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {PARTS.map((p) => (
            <tr key={p.key} className="border-t border-border first:border-t-0">
              <td className="py-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm mr-2 align-middle" style={{ background: p.fill }} aria-hidden />{p.label}</td>
              <td className="py-1.5 text-right tabular-nums text-text-secondary">{gb(e[p.key])}</td>
              <td className="py-1.5 text-right tabular-nums text-text-tertiary w-16">{e.total ? Math.round((e[p.key] / e.total) * 100) : 0}%</td>
            </tr>
          ))}
          {e.host > 0 && <tr className="border-t border-border"><td className="py-1.5 text-text-secondary">Moved to host memory</td><td className="py-1.5 text-right tabular-nums text-text-secondary">{gb(e.host)}</td><td /></tr>}
        </tbody>
      </table>
      <p className="text-xs text-text-tertiary">Usable memory is {Math.round(USABLE * 100)} percent of the card, which leaves room for the driver and fragmentation.</p>
    </div>
  );
}
