"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Select, Toggle } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Notice } from "@/components/mlops/ui";
import { ConnectorMark } from "@/components/refinery/bits";
import { useRefinery } from "@/lib/refinery/store";
import { syncsToServer, useServerSetting } from "@/lib/refinery/settingsSync";
import { SettingSyncNote } from "@/components/refinery/SettingSyncNote";
import { policyKey, DEFAULT_POLICY, PLACES, PRESETS, checkRecipe, loadPolicy, placeLabel, placeOfConnection, placeOfPool, savePolicy, type Hop, type Place, type Policy, type Where } from "@/lib/refinery/sovereignty";

const STATUS = { compliant: ["healthy", "Stays inside"], breaks: ["down", "Leaves the allowed places"], unverified: ["degraded", "Cannot tell"] } as const;
const HOP_TONE = { inside: "border-[#02F5A1]/60 bg-[#02F5A1]/[0.08]", outside: "border-status-down/50 bg-status-down/[0.07]", unknown: "border-border bg-surface-muted" } as const;

function Flow({ hops, judge }: { hops: Hop[]; judge: boolean }) {
  return (
    <ol className="flex flex-wrap items-stretch gap-1.5" aria-label="Where the data goes">
      {hops.map((h, i) => (
        <li key={i} className={clsx("rounded-md border px-2.5 py-1.5 min-w-[120px]", judge ? HOP_TONE[h.verdict] : "border-border bg-surface-muted")} title={h.basis}>
          <div className="text-[10.5px] uppercase tracking-wider text-text-tertiary">{h.role}</div>
          <div className="text-xs font-medium leading-tight mt-0.5 break-words">{h.label}</div>
          <div className="text-xs text-text-secondary mt-0.5">{placeLabel(h.where)}</div>
        </li>))}
    </ol>
  );
}

export default function DataLocationPage() {
  const { recipes, datasets, connections, pools } = useRefinery();
  const [p, setP] = useState<Policy>(DEFAULT_POLICY); const [ready, setReady] = useState(false);
  useEffect(() => { setP(loadPolicy()); setReady(true); }, []);
  useServerSetting("org", "org", "data-location", policyKey, () => setP(loadPolicy()));
  const change = (patch: Partial<Policy>) => setP((cur) => { const next = { ...cur, ...patch }; savePolicy(next); return next; });
  const toggle = (id: Place) => change({ allowed: p.allowed.includes(id) ? p.allowed.filter((x) => x !== id) : [...p.allowed, id] });
  const setPlace = (key: string, w: Where | "") => { const places = { ...p.places }; if (w) places[key] = w; else delete places[key]; change({ places }); };
  const checks = useMemo(() => recipes.map((r) => checkRecipe(r, p, datasets, connections, pools)), [recipes, p, datasets, connections, pools]);
  const count = (s: string) => checks.filter((c) => c.status === s).length;
  const whereOptions = <><option value="">As judged</option>{PLACES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</>;
  if (!ready) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Data location</h2>
          <p className="text-sm text-text-secondary mt-1 max-w-2xl">Say where your data is allowed to be. Every pipeline is followed from its source, through the runner and any model call, to its outputs, and checked against that list.</p>
        </div>
      </div>

      <Notice title="What this checks, and what it does not">
        Places are judged from the region or host written on each connection and runner pool, for example eu-west-1 or a name on a private network. That reads names. It does not measure where bytes are stored, so correct any place that is wrong, and a place that cannot be told is reported as not known, not as safe. {syncsToServer() ? "The policy is kept on the server and checked when a run starts, scheduled runs included. The runner does not check it again." : "In the sample workspace the policy is kept in this browser and only the console checks it."}
      </Notice>
      <SettingSyncNote />

      <Card>
        <div className="p-5 space-y-5">
          <Toggle checked={p.enabled} onChange={(v) => change({ enabled: v })} label="Apply a data location policy" description="When this is off no pipeline is checked." />
          <div className={clsx("space-y-5", !p.enabled && "opacity-50 pointer-events-none")} aria-disabled={!p.enabled}>
            <fieldset>
              <legend className="text-[13px] font-medium mb-2">Data may be in</legend>
              <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="Allowed places">
                {PLACES.map((x) => { const on = p.allowed.includes(x.id); return (
                  <button key={x.id} type="button" aria-pressed={on} onClick={() => toggle(x.id)} className={clsx("h-8 px-3 rounded-md border text-[13px] transition-colors", on ? "border-[#07191E] bg-[#02F5A1]/[0.18] font-medium" : "border-border hover:bg-surface-muted")}>{x.label}</button>); })}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
                <span>Start from</span>
                {PRESETS.map((x) => <button key={x.id} type="button" onClick={() => change({ allowed: x.allowed })} className="underline underline-offset-2 hover:text-text-primary">{x.label}</button>)}
              </div>
            </fieldset>

            <div className="grid sm:grid-cols-3 gap-4">
              <label className="block"><span className="text-[13px] font-medium">tok∑ner runs in</span><Select className="mt-1.5" value={p.platformPlace} onChange={(e) => change({ platformPlace: e.target.value as Where })}><option value="unknown">Not set</option>{PLACES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select><span className="block text-xs text-text-tertiary mt-1">Where uploads, platform datasets and the built-in engine are.</span></label>
              <label className="block"><span className="text-[13px] font-medium">Model steps</span><Select className="mt-1.5" value={p.modelSteps} onChange={(e) => change({ modelSteps: e.target.value as Policy["modelSteps"] })}><option value="allow">Allowed</option><option value="block">Not allowed</option></Select><span className="block text-xs text-text-tertiary mt-1">Steps that send text to a model through the gateway.</span></label>
              <label className="block"><span className="text-[13px] font-medium">The gateway serves models in</span><Select className="mt-1.5" value={p.modelPlace} disabled={p.modelSteps === "block"} onChange={(e) => change({ modelPlace: e.target.value as Where })}><option value="unknown">Not set</option>{PLACES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select><span className="block text-xs text-text-tertiary mt-1">You declare this. The console cannot see it.</span></label>
            </div>
            <Toggle checked={p.enforce} onChange={(v) => change({ enforce: v })} label="Stop runs that break the policy" description={syncsToServer() ? "A pipeline with a place known to be outside the list is refused when a run starts, by a person or a schedule. A place that is not known does not stop a run." : "A pipeline with a place known to be outside the list cannot be run from the console. A place that is not known does not stop a run."} />
          </div>
        </div>
      </Card>

      <section>
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h3 className="text-[13px] font-semibold">Pipelines</h3>
          {p.enabled && <span className="text-xs text-text-secondary">{count("compliant")} stay inside, {count("breaks")} leave, {count("unverified")} cannot be told</span>}
        </div>
        <Table>
          <Thead><tr><Th>Pipeline</Th><Th>Result</Th><Th>Where the data goes</Th></tr></Thead>
          <tbody>{checks.map((c) => (
            <Tr key={c.recipe}>
              <Td className="font-medium align-top">{c.recipe}</Td>
              <Td className="align-top">{p.enabled ? <Badge tone={STATUS[c.status][0]}>{STATUS[c.status][1]}</Badge> : <span className="text-xs text-text-tertiary">Policy off</span>}</Td>
              <Td className="space-y-2"><Flow hops={c.hops} judge={p.enabled} />{p.enabled && c.reasons.length > 0 && <ul className="text-xs text-text-secondary space-y-0.5">{c.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}</Td>
            </Tr>))}</tbody>
        </Table>
      </section>

      <section>
        <h3 className="text-[13px] font-semibold mb-2">Where each connection and pool is</h3>
        <Table>
          <Thead><tr><Th>Name</Th><Th>Judged as</Th><Th>Basis</Th><Th>Correct it</Th></tr></Thead>
          <tbody>
            {connections.map((c) => { const j = placeOfConnection(c, p.places[`conn:${c.id}`]); return (
              <Tr key={c.id}>
                <Td><div className="flex items-center gap-2.5"><ConnectorMark id={c.connector} size={26} /><span className="font-medium">{c.name}</span></div></Td>
                <Td>{placeLabel(j.where)}</Td><Td className="text-xs text-text-secondary">{j.basis}</Td>
                <Td><Select aria-label={`Place of ${c.name}`} className="h-8 py-0 w-52" value={p.places[`conn:${c.id}`] ?? ""} onChange={(e) => setPlace(`conn:${c.id}`, e.target.value as Where | "")}>{whereOptions}</Select></Td>
              </Tr>); })}
            {pools.map((x) => { const j = placeOfPool(x, p); return (
              <Tr key={x.id}>
                <Td><span className="font-medium">{x.name}</span> <span className="text-xs text-text-tertiary">runner pool</span></Td>
                <Td>{placeLabel(j.where)}</Td><Td className="text-xs text-text-secondary">{j.basis}</Td>
                <Td>{x.builtIn ? <span className="text-xs text-text-tertiary">Set above</span> : <Select aria-label={`Place of ${x.name}`} className="h-8 py-0 w-52" value={p.places[`pool:${x.id}`] ?? ""} onChange={(e) => setPlace(`pool:${x.id}`, e.target.value as Where | "")}>{whereOptions}</Select>}</Td>
              </Tr>); })}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
