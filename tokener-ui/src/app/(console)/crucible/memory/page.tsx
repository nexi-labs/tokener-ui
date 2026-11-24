"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Notice } from "@/components/mlops/ui";
import { BreakdownView, PlanForm } from "@/components/crucible/Planner";
import { gb } from "@/components/crucible/bits";
import { PRESETS, TECHNIQUE_BY_ID, defaultPlan, estimate, smallestFix, suggestions, type PlanInput } from "@/lib/crucible/memory";

export default function MemoryPlanner() {
  const [input, setInput] = useState<PlanInput>(() => ({ ...defaultPlan(PRESETS[3]), gpus: 8, gpuGb: 80 }));
  const e = useMemo(() => estimate(input), [input]);
  const sugg = useMemo(() => suggestions(input), [input]);
  const fix = useMemo(() => smallestFix(input), [input]);
  const apply = (id: string) => { const next = TECHNIQUE_BY_ID[id].apply(input); if (next) setInput(next); };

  return (
    <div className="space-y-6">
      <PageHeader title="Memory planner" description="Estimates the GPU memory a training job needs before it takes a GPU, and finds the smallest change that makes it fit. Submitting a job runs the same check." />
      <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-6 items-start">
        <Card className="p-5"><PlanForm value={input} onChange={setInput} /></Card>
        <div className="space-y-5">
          <Card className="p-5"><BreakdownView input={input} /></Card>

          {!e.fits && (
            <Card className="p-5 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">{fix.fits ? "The smallest change that fits" : "No combination of these changes fits"}</h3>
                <p className="text-xs text-text-tertiary mt-0.5">Cheapest changes first. A change is kept only when it saves memory.</p>
              </div>
              {fix.steps.length > 0 ? (
                <ol className="space-y-2">
                  {fix.steps.map((s, i) => (
                    <li key={s.id} className="flex items-start gap-3 text-sm">
                      <span className="h-5 w-5 rounded-full border border-border-strong text-[11px] grid place-items-center mt-0.5 shrink-0 tabular-nums">{i + 1}</span>
                      <div className="min-w-0"><div className="text-text-primary">{s.label}</div><div className="text-xs text-text-tertiary">{s.cost} Then {gb(s.totalGb)}.</div></div>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-sm text-text-secondary">None of the changes saves memory for this setup. Use more GPUs or a larger card.</p>}
              {fix.steps.length > 0 && <Button variant="primary" onClick={() => setInput(fix.final)}><Check size={14} /> Apply these changes</Button>}
            </Card>
          )}

          <Card className="p-5 space-y-3">
            <div><h3 className="text-sm font-semibold text-text-primary">Each change on its own</h3><p className="text-xs text-text-tertiary mt-0.5">What one change would save from the current setup, largest first.</p></div>
            {sugg.length === 0 ? <p className="text-sm text-text-secondary">Nothing left to switch on. Every change that saves memory is already applied.</p> : (
              <ul className="divide-y divide-border">
                {sugg.map((s) => (
                  <li key={s.id} className="py-2.5 flex items-center justify-between gap-4">
                    <div className="min-w-0"><div className="text-sm text-text-primary">{s.label}</div><div className="text-xs text-text-tertiary">{s.cost}</div></div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right text-xs"><div className="tabular-nums text-text-primary">Saves {gb(s.savedGb)}</div><div className="text-text-tertiary">{s.fits ? "Then fits" : `Then ${gb(s.totalGb, 0)}`}</div></div>
                      <Button variant="secondary" className="h-8" onClick={() => apply(s.id)}>Apply</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Notice title="How this is estimated">Mixed precision AdamW needs 16 bytes for each trained parameter: 2 for weights, 2 for gradients and 12 for the optimizer. Activations follow the published per layer formula. It is an estimate and has not been validated against real hardware yet. Each finished run records its measured peak so the planner can be compared with what happened.</Notice>
        </div>
      </div>
    </div>
  );
}
