"use client";

import clsx from "clsx";
import { Check, Copy, Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Toggle } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Modal, Notice, Tabs } from "@/components/mlops/ui";
import { useServerSetting } from "@/lib/refinery/settingsSync";
import { SettingSyncNote } from "@/components/refinery/SettingSyncNote";
import { edgeKey, CONNECTIVITY, PLATFORMS, bundleZip, checkPipelines, edgeBundle, loadEdge, saveEdge, type EdgeProfile } from "@/lib/refinery/edge";
import { useRefinery } from "@/lib/refinery/store";
import type { RunnerPool } from "@/lib/refinery/types";

const FIT = { runs: ["healthy", "Runs"], waits: ["degraded", "Waits for the link"], blocked: ["down", "Cannot run"] } as const;

export function EdgeDialog({ pool, onClose }: { pool: RunnerPool | null; onClose: () => void }) {
  const { recipes, datasets, connections } = useRefinery();
  const [p, setP] = useState<EdgeProfile>(() => loadEdge(pool?.id ?? ""));
  const [file, setFile] = useState("docker-compose.yml");
  const [copied, setCopied] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { if (pool) setP(loadEdge(pool.id)); }, [pool?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useServerSetting("pools", pool?.id ?? "", "edge", edgeKey(pool?.id ?? ""), () => { if (pool) setP(loadEdge(pool.id)); });
  const change = (patch: Partial<EdgeProfile>) => setP((cur) => { const next = { ...cur, ...patch }; if (pool) saveEdge(pool.id, next); return next; });
  const num = (k: "bufferGb" | "retentionDays" | "syncEveryMinutes", max: number) => (e: React.ChangeEvent<HTMLInputElement>) => change({ [k]: Math.min(max, Math.max(1, Math.round(Number(e.target.value) || 1))) });
  const fits = useMemo(() => (pool ? checkPipelines(pool, p, recipes, datasets, connections) : []), [pool, p, recipes, datasets, connections]);
  const files = useMemo(() => (pool ? edgeBundle(pool, p) : []), [pool, p]);
  if (!pool) return null;
  const cur = files.find((f) => f.name === file) ?? files[0];
  const download = async () => {
    setBusy(true);
    try { const blob = await bundleZip(pool, p); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${p.platform === "industrial-edge" ? "industrial-edge-app" : "edge-runner"}-${pool.name}.zip`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); } finally { setBusy(false); }
  };
  const blocked = fits.filter((f) => f.fit === "blocked").length;
  return (
    <Modal open onClose={onClose} wide title={`Edge deployment: ${pool.name}`}
      footer={<><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={download} disabled={busy}><Download size={14} /> {busy ? "Preparing" : "Download bundle (.zip)"}</Button></>}>
      <div className="space-y-6">
        <Notice title="Set up for a plant with a weak or no connection to the cloud">
          Choose how connected the site is. The check below shows which pipelines on this pool can run under that choice, and the bundle holds what an installer needs. The runner&apos;s edge mode, which holds output in a local buffer and sends it when the link returns, is in development: the bundle is the configuration it will read.
        </Notice>

        <SettingSyncNote />

        <fieldset>
          <legend className="text-[13px] font-medium mb-2">Install on</legend>
          <div role="radiogroup" className="grid sm:grid-cols-2 gap-2.5">
            {PLATFORMS.map((c) => { const on = (p.platform ?? "docker") === c.id; return (
              <button key={c.id} role="radio" aria-checked={on} onClick={() => { change({ platform: c.id }); setFile("docker-compose.yml"); }} className={clsx("text-left rounded-lg border p-3.5 transition-colors", on ? "border-[#02F5A1] bg-[#02F5A1]/[0.07]" : "border-border hover:bg-surface-muted")}>
                <span className="flex items-center gap-2 text-[13px] font-semibold"><span className={clsx("h-3.5 w-3.5 rounded-full border grid place-items-center", on ? "border-[#07191E]" : "border-border-strong")}>{on && <span className="h-2 w-2 rounded-full bg-[#07191E]" />}</span>{c.label}</span>
                <span className="block text-xs text-text-secondary mt-1.5 leading-relaxed">{c.blurb}</span>
              </button>); })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-[13px] font-medium mb-2">Connectivity</legend>
          <div role="radiogroup" className="grid sm:grid-cols-3 gap-2.5">
            {CONNECTIVITY.map((c) => { const on = p.connectivity === c.id; return (
              <button key={c.id} role="radio" aria-checked={on} onClick={() => change({ connectivity: c.id })} className={clsx("text-left rounded-lg border p-3.5 transition-colors", on ? "border-[#02F5A1] bg-[#02F5A1]/[0.07]" : "border-border hover:bg-surface-muted")}>
                <span className="flex items-center gap-2 text-[13px] font-semibold"><span className={clsx("h-3.5 w-3.5 rounded-full border grid place-items-center", on ? "border-[#07191E]" : "border-border-strong")}>{on && <span className="h-2 w-2 rounded-full bg-[#07191E]" />}</span>{c.label}</span>
                <span className="block text-xs text-text-secondary mt-1.5 leading-relaxed">{c.blurb}</span>
              </button>); })}
          </div>
        </fieldset>

        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Local buffer (GB)" hint="Holds output until it is sent."><Input type="number" min={1} max={4096} value={p.bufferGb} disabled={p.connectivity === "online"} onChange={num("bufferGb", 4096)} /></Field>
          <Field label="Keep unsent output (days)" hint="After this it is reported as lost."><Input type="number" min={1} max={365} value={p.retentionDays} disabled={p.connectivity === "online"} onChange={num("retentionDays", 365)} /></Field>
          <Field label="Try to sync every (minutes)" hint="Oldest output first."><Input type="number" min={1} max={1440} value={p.syncEveryMinutes} disabled={p.connectivity === "online"} onChange={num("syncEveryMinutes", 1440)} /></Field>
        </div>
        <Toggle checked={p.syncMetrics} onChange={(v) => change({ syncMetrics: v })} label="Send run counts and timings to tok∑ner" description="Lets the run page show progress. Turn it off if even these numbers must stay in the plant." />

        <section>
          <h3 className="text-[13px] font-semibold mb-2">Pipelines on this pool</h3>
          {fits.length === 0 ? <p className="text-[13px] text-text-secondary">No pipeline uses this pool yet. Assign one in its settings and it will be checked here.</p> : (
            <>
              {blocked > 0 && <div className="mb-3"><Notice tone="warn">{blocked} of {fits.length} pipeline{fits.length === 1 ? "" : "s"} cannot run while the site is offline. Move them to another pool, or keep the model step and internet sources off this site.</Notice></div>}
              <Table>
                <Thead><tr><Th>Pipeline</Th><Th>Under this choice</Th><Th>Why</Th></tr></Thead>
                <tbody>{fits.map((f) => (
                  <Tr key={f.recipe}><Td className="font-medium align-top">{f.recipe}</Td><Td className="align-top"><Badge tone={FIT[f.fit][0]}>{FIT[f.fit][1]}</Badge></Td><Td className="text-text-secondary text-[13px]"><ul className="space-y-1">{f.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></Td></Tr>))}</tbody>
              </Table>
            </>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between gap-3 mb-2">
            <h3 className="text-[13px] font-semibold">Bundle</h3>
            <button onClick={() => { void navigator.clipboard?.writeText(cur.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border-strong text-xs hover:bg-surface-muted">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy file"}</button>
          </div>
          <Tabs tabs={files.map((f) => ({ id: f.name, label: f.name }))} value={cur.name} onChange={setFile} label="Bundle files" wrap />
          <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-[#07191E] text-[#D6F5E9] text-[11.5px] leading-relaxed p-3.5 font-code" aria-label={cur.name}>{cur.content}</pre>
          <p className="text-xs text-text-tertiary mt-2">The enrolment token is read from the environment on the edge host. It is not written into any of these files.</p>
        </section>
      </div>
    </Modal>
  );
}
