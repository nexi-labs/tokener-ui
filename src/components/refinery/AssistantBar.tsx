"use client";

import clsx from "clsx";
import { useState } from "react";
import { Check, Lightbulb, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/mlops/ui";
import { STEP_BY_OP, describe, type Col } from "@/lib/refinery/steps";
import { EXAMPLE_PROMPTS, proposeSteps, suggestFromProfile, type AssistResult } from "@/lib/refinery/assist";
import { useRefineryStatus } from "@/lib/refinery/store";
import type { Dataset, Step } from "@/lib/refinery/types";
import { GROUP_STYLE } from "@/components/refinery/PipelineCanvas";

const connected = false; // a connected workspace sends the request through the gateway to a model; the sample uses a local reader

/** Describe what you want in words. The reply is a list of proposed steps with the reason for each. Nothing is added until it is accepted. */
export function AssistantBar({ cols, ds, firstId, onAdd }: { cols: Col[]; ds: Dataset | undefined; firstId: number; onAdd: (steps: Step[]) => void }) {
  const isLive = useRefineryStatus().mode === "live";
  const [text, setText] = useState("");
  const [res, setRes] = useState<AssistResult | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sug, setSug] = useState(false);
  const [sPicked, setSPicked] = useState<Set<string>>(new Set());

  const ask = (t = text) => { if (!t.trim()) return; const r = proposeSteps(t, cols, firstId); setRes(r); setPicked(new Set(r.proposals.map((p) => p.step.id))); };
  const accept = () => { if (!res) return; onAdd(res.proposals.filter((p) => picked.has(p.step.id)).map((p) => p.step)); setRes(null); setText(""); };
  const suggestions = ds ? suggestFromProfile(ds) : [];
  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); fn(n); };

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-col md:flex-row gap-2.5 p-3">
        <div className="relative flex-1">
          <Sparkles size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#067A4E]" />
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(); }} aria-label="Describe the cleaning you want" placeholder="Describe what to clean, for example: trim spaces in subject, mask emails in body, then split 80/10/10" className="w-full h-10 rounded-md border border-border-strong bg-surface pl-9 pr-3 text-sm placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-600/40" />
        </div>
        <div className="flex gap-2 shrink-0"><Button variant="primary" onClick={() => ask()} disabled={!text.trim()}><Sparkles size={14} /> Propose steps</Button><Button onClick={() => { setSug(true); setSPicked(new Set(suggestions.filter((s) => !/^Review|Review before/.test(s.reason)).map((s) => s.id))); }}><Lightbulb size={14} /> Suggest from profile</Button></div>
      </div>
      {!res && <div className="px-3 pb-3 -mt-0.5 flex flex-wrap items-center gap-1.5 text-xs"><span className="text-text-tertiary mr-1">Try</span>{EXAMPLE_PROMPTS.slice(0, 4).map((x) => <button key={x} type="button" onClick={() => { setText(x); ask(x); }} className="rounded-full border border-border px-2.5 py-1 text-text-secondary hover:bg-surface-subtle">{x}</button>)}</div>}

      {res && (
        <div className="border-t border-border p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-3"><h3 className="text-[13px] font-semibold">{res.proposals.length ? `${res.proposals.length} proposed step${res.proposals.length === 1 ? "" : "s"}` : "No steps proposed"}</h3><button aria-label="Discard proposals" onClick={() => setRes(null)} className="h-7 w-7 grid place-items-center rounded hover:bg-surface-muted text-text-tertiary"><X size={14} /></button></div>
          <ul className="space-y-2">
            {res.proposals.map((p) => { const d = STEP_BY_OP.get(p.step.op); const g = d ? GROUP_STYLE[d.group] : null; const on = picked.has(p.step.id); return (
              <li key={p.step.id}><label className={clsx("flex items-start gap-3 rounded-md border px-3.5 py-2.5 cursor-pointer", on ? "border-border-strong bg-surface-subtle" : "border-border opacity-70")}>
                <input type="checkbox" className="mt-1 accent-[#02F5A1]" checked={on} onChange={() => toggle(picked, p.step.id, setPicked)} />
                {g && <g.Icon size={15} style={{ color: g.color }} className="mt-0.5 shrink-0" />}
                <div className="min-w-0"><div className="text-[13px] font-medium">{d?.label}: <span className="font-normal text-text-secondary">{describe(p.step)}</span></div><div className="text-xs text-text-tertiary mt-0.5">{p.because}</div></div>
              </label></li>); })}
          </ul>
          {res.unmatched.length > 0 && <div className="rounded-md border border-status-degraded/40 bg-status-degraded/5 px-3.5 py-2.5 text-xs text-[#8A5504]"><div className="font-medium mb-1">Not understood</div><ul className="list-disc pl-4 space-y-0.5">{res.unmatched.map((u) => <li key={u}>{u}</li>)}</ul><div className="mt-1.5">Rephrase these, or add the step from the catalogue.</div></div>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-text-tertiary max-w-2xl">{connected ? "Read by a model through the gateway, so the request is metered and follows your policies." : (isLive ? "A reader in this browser turns the request into steps. Nothing is sent anywhere. Routing it through a model on the gateway is not connected yet." : "In the sample workspace a local reader turns the request into steps. A connected workspace sends it through the gateway to a model you choose.")} Accepted steps are added at the end, where you can edit or move them.</p>
            <div className="flex gap-2"><Button onClick={() => setRes(null)}>Discard</Button><Button variant="primary" disabled={picked.size === 0} onClick={accept}><Check size={14} /> Add {picked.size} step{picked.size === 1 ? "" : "s"}</Button></div>
          </div>
        </div>
      )}

      <Modal open={sug} onClose={() => setSug(false)} title="Suggestions from the profile" wide footer={<><Button onClick={() => setSug(false)}>Close</Button><Button variant="primary" disabled={sPicked.size === 0} onClick={() => { let n = firstId; onAdd(suggestions.filter((s) => sPicked.has(s.id)).map((s) => ({ id: `s${n++}`, ...s.step }))); setSug(false); }}>Add {sPicked.size} step{sPicked.size === 1 ? "" : "s"}</Button></>}>
        {suggestions.length === 0 ? <p className="text-sm text-text-secondary">Nothing stands out in the profile of this dataset.</p> : (
          <div className="space-y-2.5">
            <p className="text-xs text-text-secondary">Read from the profile and sample of {ds?.name}. Each idea says why, so you can judge it. Nothing is added until you choose.</p>
            {suggestions.map((s) => (
              <label key={s.id} className="flex items-start gap-3 rounded-md border border-border px-3.5 py-3 cursor-pointer hover:bg-surface-subtle">
                <input type="checkbox" className="mt-1 accent-[#02F5A1]" checked={sPicked.has(s.id)} onChange={() => toggle(sPicked, s.id, setSPicked)} />
                <div className="min-w-0"><div className="flex items-center gap-2"><span className="text-[13px] font-medium">{s.title}</span><span className="text-[10px] uppercase tracking-wide rounded-full border border-border px-1.5 py-0.5 text-text-tertiary">{s.kind}</span></div><div className="text-xs text-text-secondary mt-1">{s.reason}</div></div>
              </label>))}
          </div>)}
      </Modal>
    </div>
  );
}
