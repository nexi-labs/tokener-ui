"use client";

import { useEffect, useState } from "react";
import { Cpu, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Form";
import { Notice } from "@/components/mlops/ui";
import { Bar, fmtInt } from "@/components/refinery/bits";
import { NATIVE_CEILING, NATIVE_DEFAULTS, NATIVE_FIELDS, type NativeLimits } from "@/lib/refinery/engines";
import { refinery, useRefinery } from "@/lib/refinery/store";
import { toast } from "@/lib/mlops/toast";

/** The built-in engine: what it is, how busy it is, and the limits that keep a cleaning job from taking the platform down. */
export function NativeEnginePanel() {
  const { nativeLimits, runs, streams, pools } = useRefinery();
  const native = pools.find((p) => p.engine === "native");
  const [draft, setDraft] = useState<NativeLimits>(nativeLimits);
  useEffect(() => setDraft(nativeLimits), [nativeLimits]);
  if (!native) return null;
  const active = runs.filter((r) => r.pool === native.name && (r.status === "running" || r.status === "planning")).length;
  const waiting = runs.filter((r) => r.pool === native.name && r.status === "queued").length;
  const nStreams = streams.filter((s) => s.pool === native.name && s.status !== "paused" && s.status !== "failed").length;
  const dirty = NATIVE_FIELDS.some((f) => draft[f.key] !== nativeLimits[f.key]);
  const over = NATIVE_FIELDS.filter((f) => draft[f.key] > NATIVE_CEILING[f.key]);
  const save = async () => { const r = await refinery.saveLimits(draft); if (!r.ok) { toast(r.error, "error"); return; } const { clamped } = r; toast(clamped.length ? `Saved. Kept inside the platform ceiling: ${clamped.join(", ")}` : "Limits saved", clamped.length ? "info" : undefined); };
  return (
    <Card>
      <div className="p-5 space-y-5">
        <div className="flex items-start gap-3">
          <span className="h-10 w-10 rounded-lg bg-[#07191E] text-[#02F5A1] grid place-items-center shrink-0"><Cpu size={18} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-[15px] font-semibold">Native engine</h3><Badge tone="healthy">Default</Badge><Badge tone="neutral">Built in</Badge></div>
            <p className="text-sm text-text-secondary mt-1 max-w-3xl">Cleaning runs inside the tok∑ner backend on virtual threads, with a parallelism you set. There is nothing to install and no cluster to run. It is the slowest engine on large inputs, so it comes with limits: a run that would go over them is slowed down or refused before it starts, and the platform stays up. Choose Spark, a single node runner or Flink for bigger work.</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 text-xs">
          {[["Runs working", active, nativeLimits.concurrentRuns, `${waiting} waiting`], ["Streams running", nStreams, nativeLimits.streams, "on the native engine"], ["Memory in use", Math.round((native.memPct / 100) * nativeLimits.memoryMb), nativeLimits.memoryMb, "MB of the budget"]].map(([l, v, max, sub]) => (
            <div key={l as string} className="rounded-md border border-border px-3.5 py-3"><div className="flex justify-between text-text-secondary"><span>{l}</span><span className="tabular-nums">{fmtInt(v as number)} of {fmtInt(max as number)}</span></div><div className="mt-2"><Bar value={Math.min(100, ((v as number) / Math.max(1, max as number)) * 100)} /></div><div className="text-text-tertiary mt-1.5">{sub}</div></div>))}
        </div>

        <div>
          <h4 className="text-[13px] font-semibold mb-1">Limits</h4>
          <p className="text-xs text-text-secondary mb-3">Lower any of these for your workspace. None can go above the platform ceiling shown beside it.</p>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {NATIVE_FIELDS.map((f) => (
              <label key={f.key} className="block text-xs">
                <span className="block text-[13px] font-medium text-text-primary mb-1">{f.label}</span>
                <span className="relative block"><Input type="number" min={f.min} max={NATIVE_CEILING[f.key]} step={f.step} value={draft[f.key]} aria-invalid={draft[f.key] > NATIVE_CEILING[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })} className="pr-16 tabular-nums" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none">{f.unit}</span></span>
                <span className="block text-text-tertiary mt-1">Platform ceiling {NATIVE_CEILING[f.key].toLocaleString("en-US")}. {f.hint}</span>
              </label>))}
          </div>
          {over.length > 0 && <div className="mt-3"><Notice tone="warn">{over.map((f) => f.label).join(", ")} {over.length === 1 ? "is" : "are"} above the platform ceiling. Saving keeps {over.length === 1 ? "it" : "them"} at the ceiling.</Notice></div>}
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Button variant="primary" disabled={!dirty} onClick={save}>Save limits</Button>
            <Button variant="secondary" onClick={() => { setDraft({ ...NATIVE_DEFAULTS }); }}><RotateCcw size={14} /> Defaults</Button>
          </div>
        </div>
        <p className="text-xs text-text-tertiary">Memory and size rules of thumb: a partition needs about three times its size while it is decoded, changed and written, and a step that needs all rows holds the input in memory. These are estimates used to stay safe, not measurements.</p>
      </div>
    </Card>
  );
}
