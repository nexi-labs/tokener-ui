"use client";

import clsx from "clsx";
import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Segmented, Toggle } from "@/components/ui/Form";
import { Notice } from "@/components/mlops/ui";
import { APPS, type AppPolicy } from "@/lib/optimize/data";
import { MODE_STAGES, STAGES, type Mode, type StageId } from "@/lib/optimize/stages";

const MODES: { value: Exclude<Mode, "off">; label: string }[] = [{ value: "lossless", label: "Lossless" }, { value: "balanced", label: "Balanced" }, { value: "aggressive", label: "Aggressive" }];
const fmt = (n: number) => n.toLocaleString("en-US");

export function Policies() {
  const [apps, setApps] = useState<AppPolicy[]>(APPS);
  const [sel, setSel] = useState(APPS[0].id);
  const [saved, setSaved] = useState(false);
  const a = apps.find((x) => x.id === sel)!;
  const patch = (p: Partial<AppPolicy>) => { setApps((l) => l.map((x) => (x.id === sel ? { ...x, ...p } : x))); setSaved(false); };
  const setMode = (m: Exclude<Mode, "off">) => patch({ mode: m, stages: MODE_STAGES[m] });
  const toggle = (id: StageId) => patch({ stages: a.stages.includes(id) ? a.stages.filter((x) => x !== id) : [...a.stages, id] });
  const lossy = a.stages.includes("pack") || a.stages.includes("noise") || a.stages.includes("alias");

  return (
    <div className="grid lg:grid-cols-[18rem_minmax(0,1fr)] gap-5">
      <Card className="self-start">
        <CardHeader title="Applications" />
        <ul className="divide-y divide-border">
          {apps.map((x) => (
            <li key={x.id}>
              <button onClick={() => { setSel(x.id); setSaved(false); }} aria-current={x.id === sel}
                className={clsx("w-full text-left px-5 py-3 transition-colors", x.id === sel ? "bg-accent-50/50" : "hover:bg-surface-subtle")}>
                <div className="flex items-center justify-between gap-2"><span className="text-[13px] font-medium">{x.name}</span><Badge tone={x.mode === "lossless" ? "healthy" : x.mode === "balanced" ? "info" : "degraded"}>{x.mode}</Badge></div>
                <div className="text-xs text-text-tertiary mt-0.5">{x.owner} &middot; {fmt(x.requestsPerDay)} requests a day</div>
              </button>
            </li>))}
        </ul>
      </Card>

      <div className="space-y-4 min-w-0">
        <Card>
          <CardHeader title={a.name} subtitle={a.note} />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div><div className="text-text-tertiary">Saved</div><div className="text-lg font-semibold tabular-nums">{a.savedPct}%</div></div>
              <div><div className="text-text-tertiary">Fidelity score</div><div className="text-lg font-semibold tabular-nums">{a.fidelity}%</div></div>
              <div><div className="text-text-tertiary">Requests a day</div><div className="text-lg font-semibold tabular-nums">{fmt(a.requestsPerDay)}</div></div>
            </div>
            <div>
              <div className="text-[13px] font-medium mb-1.5">Fidelity mode</div>
              <Segmented value={a.mode as Exclude<Mode, "off">} onChange={setMode} options={MODES} />
              <p className="text-xs text-text-tertiary mt-1.5">Lossless never removes meaning. Balanced and aggressive may drop low value sentences, and always keep numbers, identifiers, quotations and links.</p>
            </div>
            <div>
              <div className="text-[13px] font-medium">Content stages</div>
              <ul className="divide-y divide-border">
                {STAGES.map((s) => (
                  <li key={s.id}><Toggle checked={a.stages.includes(s.id)} onChange={() => toggle(s.id)} label={s.label} description={s.body} /></li>))}
              </ul>
              {lossy && <Notice tone="info">This application drops some content. Its shadow score must stay above the floor on the Fidelity tab, or the lossy stages turn off by themselves.</Notice>}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Caching and output" />
          <CardBody className="space-y-1">
            <Toggle checked={a.cache} onChange={(v) => patch({ cache: v })} label="Exact response cache" description="Returns the stored answer for an identical request." />
            <Toggle checked={a.semantic} onChange={(v) => patch({ semantic: v })} label="Semantic cache" description="Returns a stored answer for a near-identical question." />
            <div className="grid sm:grid-cols-3 gap-3 pt-2">
              <Field label="Similarity threshold" hint="Higher is stricter."><Input type="number" step={0.01} min={0.5} max={1} value={a.threshold} disabled={!a.semantic} onChange={(e) => patch({ threshold: Number(e.target.value) })} /></Field>
              <Field label="Cache lifetime (hours)"><Input type="number" min={1} value={a.ttlHours} disabled={!a.cache} onChange={(e) => patch({ ttlHours: Number(e.target.value) })} /></Field>
              <Field label="Maximum output tokens"><Input type="number" min={50} step={50} value={a.maxOutput} onChange={(e) => patch({ maxOutput: Number(e.target.value) })} /></Field>
            </div>
            <Toggle checked={a.batch} onChange={(v) => patch({ batch: v })} label="Allow batch routing" description="Requests marked as not time sensitive go through provider batch interfaces at a lower price, and may take up to 24 hours." />
          </CardBody>
        </Card>

        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={() => setSaved(true)}>Save policy</Button>
          {saved && <span role="status" className="text-xs text-text-secondary">Saved in the sample workspace. Nothing is stored yet.</span>}
        </div>
      </div>
    </div>
  );
}
