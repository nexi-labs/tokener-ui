"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Modal, Notice } from "@/components/mlops/ui";
import { refinery, useRefinery } from "@/lib/refinery/store";
import type { Engine, FlinkLink, Hosting } from "@/lib/refinery/types";
import { toast } from "@/lib/mlops/toast";

const HOSTING: { id: Hosting; label: string; hint: string }[] = [
  { id: "managed", label: "Managed by tok∑ner", hint: "We run the workers. Nothing to install. Data passes through our network, so identity based sign in is not available." },
  { id: "kubernetes", label: "Your Kubernetes cluster", hint: "A runner in your cluster connects out to tok∑ner. Data stays in your network and the pod's identity can sign in to your systems." },
  { id: "vm", label: "A virtual machine", hint: "One service on a machine you own. Good for a single large node and for a trial." },
  { id: "docker", label: "Docker", hint: "One container on any host with Docker. Good for a laptop or a small server." },
];
// The native engine is part of the platform and is configured on the Runners page, so it is not offered here.
const ENGINES: { id: Engine; label: string }[] = [{ id: "single", label: "Single node (Polars and DuckDB)" }, { id: "spark", label: "Spark (many workers, very large data)" }, { id: "flink", label: "Flink (streaming and change capture)" }];

const FLINK_PLACES: { id: FlinkLink["location"]; label: string; hint: string; url: string }[] = [
  { id: "cloud", label: "In the cloud", hint: "Flink on Kubernetes, YARN or a managed service in your cloud account. The runner sits in the same network as the cluster.", url: "https://flink.prod.example.com" },
  { id: "onprem", label: "On premises", hint: "A cluster in your data centre. The runner sits in the same network and connects out.", url: "http://flink-jobmanager.internal:8081" },
  { id: "local", label: "On this computer", hint: "A Flink you started on your own machine for development. A runner on the same computer reaches it on localhost.", url: "http://localhost:8081" },
];
const DEPLOYS: { id: FlinkLink["deploy"]; label: string; hint: string }[] = [
  { id: "session", label: "Session cluster (REST address)", hint: "Jobs are submitted to a running cluster through its REST API." },
  { id: "kubernetes-operator", label: "Flink Kubernetes Operator", hint: "Each job is a FlinkDeployment created in your cluster." },
  { id: "yarn", label: "YARN application", hint: "Each job is submitted as its own YARN application." },
];

const flinkCommands = (name: string, token: string, l: FlinkLink) => l.location === "local"
  ? `# On the computer that runs Flink\ndocker run -d --name refinery-runner --network host \\\n  -e REFINERY_POOL=${name} \\\n  -e REFINERY_ENROLLMENT_TOKEN=${token} \\\n  -e REFINERY_FLINK_REST=${l.restUrl} \\\n  <runner-image>`
  : l.deploy === "kubernetes-operator"
  ? `helm install refinery-runner <runner-chart> \\\n  --namespace refinery --create-namespace \\\n  --set pool=${name} \\\n  --set enrollmentToken=${token} \\\n  --set flink.mode=operator`
  : `refinery-runner enroll --pool ${name} --token ${token} \\\n  --flink-rest ${l.restUrl}\nsystemctl enable --now refinery-runner`;

const commands = (h: Hosting, name: string, token: string) => h === "kubernetes"
  ? `helm install refinery-runner <runner-chart> \\\n  --namespace refinery --create-namespace \\\n  --set pool=${name} \\\n  --set enrollmentToken=${token}`
  : h === "vm"
  ? `refinery-runner enroll --pool ${name} --token ${token}\nsystemctl enable --now refinery-runner`
  : `docker run -d --name refinery-runner \\\n  -e REFINERY_POOL=${name} \\\n  -e REFINERY_ENROLLMENT_TOKEN=${token} \\\n  <runner-image>`;

/** Create a runner pool. A pool you host is enrolled with a one-time token that is shown once. */
export function PoolWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pools } = useRefinery();
  const [f, setF] = useState({ name: "", hosting: "kubernetes" as Hosting, engine: "spark" as Engine, region: "eu-west-1", workersMin: 2, workersMax: 16, coresPerWorker: 8, memGbPerWorker: 32, concurrency: 4, network: "" });
  const [done, setDone] = useState<{ name: string; hosting: Hosting; token: string; flink?: FlinkLink } | null>(null);
  const [ownFlink, setOwnFlink] = useState(false);
  const [fl, setFl] = useState<FlinkLink>({ location: "cloud", deploy: "session", restUrl: "", auth: "bearer", secretRefs: {} });
  const [copied, setCopied] = useState(false);
  const nameErr = f.name && !/^[a-z][a-z0-9-]{1,39}$/.test(f.name) ? "Start with a letter. Use lower case letters, digits and hyphens." : pools.some((p) => p.name === f.name) ? "A pool with this name exists." : null;
  const hostH = HOSTING.find((h) => h.id === f.hosting)!;
  const flinkOk = !f.engine || f.engine !== "flink" || !ownFlink || /^https?:\/\/[^\s]+$/.test(fl.restUrl);
  const ok = flinkOk && !!f.name && !nameErr && f.workersMin >= 1 && f.workersMax >= f.workersMin && f.coresPerWorker >= 1 && f.memGbPerWorker >= 1 && f.concurrency >= 1;
  const num = (k: "workersMin" | "workersMax" | "coresPerWorker" | "memGbPerWorker" | "concurrency") => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Math.max(1, Math.round(Number(e.target.value) || 1)) });
  const close = () => { setDone(null); setCopied(false); onClose(); };
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const create = async () => {
    const own = f.engine === "flink" && ownFlink;
    const flink: FlinkLink | undefined = own ? { ...fl, secretRefs: fl.auth === "bearer" ? { token: `secretref://vault/tenant/refinery/pools/${f.name}/token` } : fl.auth === "mtls" ? { clientCert: `secretref://vault/tenant/refinery/pools/${f.name}/clientCert`, clientKey: `secretref://vault/tenant/refinery/pools/${f.name}/clientKey` } : {} } : undefined;
    // A Flink cluster you run is reached by a runner next to it. It is never "managed", because tok∑ner does not connect into your cluster.
    setBusy(true); setErr(null);
    const res = await refinery.createPool({ ...f, hosting: own && f.hosting === "managed" ? "kubernetes" : f.hosting, flink, region: own ? `Your Flink cluster, ${FLINK_PLACES.find((x) => x.id === fl.location)!.label.toLowerCase()}` : f.region, network: f.network || (own ? "A runner next to the cluster connects out. tok∑ner does not connect in." : f.hosting === "managed" ? "tok∑ner managed network" : "Your network") });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    const token = res.token;
    if (token) setDone({ name: f.name, hosting: f.hosting, token, flink }); else { toast(`Pool ${f.name} created`); close(); }
  };

  return (
    <Modal open={open} onClose={close} title={done ? `Enroll ${done.name}` : "New runner pool"} wide
      footer={done ? <Button variant="primary" onClick={close}>I have saved the token</Button> : <><Button onClick={close}>Cancel</Button><Button variant="primary" disabled={!ok || busy} onClick={create}>{busy ? "Creating" : "Create pool"}</Button></>}>
      {done ? (
        <div className="space-y-4">
          <Notice tone="warn" title="The token is shown once">It enrolls one runner and expires after use. Copy it now. If it is lost, delete the pool and create it again.</Notice>
          <div><div className="text-[13px] font-medium mb-1.5">Run this where the pool will live</div>
            <pre className="rounded-md bg-[#07191E] text-[#C9D6D8] text-[12px] leading-relaxed p-4 overflow-x-auto font-code">{done.flink ? flinkCommands(done.name, done.token, done.flink) : commands(done.hosting, done.name, done.token)}</pre>
            <div className="mt-2 flex items-center gap-3"><Button onClick={() => { void navigator.clipboard?.writeText(done.flink ? flinkCommands(done.name, done.token, done.flink) : commands(done.hosting, done.name, done.token)); setCopied(true); }}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}</Button><span className="text-xs text-text-tertiary">The runner connects out to tok∑ner. You open no inbound port.</span></div></div>
          <p className="text-xs text-text-tertiary">The command shape is the design. No runner package is published yet, so the names in angle brackets are placeholders. The pool shows as pending until a runner enrolls.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {err && <Notice tone="warn" title="The pool was not created">{err}</Notice>}
          <Field label="Name" hint={nameErr ?? "Lower case letters, digits and hyphens"}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value.toLowerCase() })} placeholder="batch-spark-eu" /></Field>
          <div><div className="text-[13px] font-medium mb-2">{f.engine === "flink" && ownFlink ? "Where the runner next to your cluster runs" : "Where the workers run"}</div>
            <div className="grid sm:grid-cols-2 gap-2.5">{HOSTING.filter((h) => !(f.engine === "flink" && ownFlink && h.id === "managed")).map((h) => <button key={h.id} type="button" aria-pressed={f.hosting === h.id} onClick={() => setF({ ...f, hosting: h.id, engine: h.id === "docker" || h.id === "vm" ? (f.engine === "spark" ? "single" : f.engine) : f.engine })} className={`text-left rounded-md border px-3.5 py-3 ${f.hosting === h.id ? "border-[#02F5A1] bg-accent-50" : "border-border hover:bg-surface-subtle"}`}><div className="text-[13px] font-medium">{h.label}</div></button>)}</div>
            <p className="text-xs text-text-secondary mt-2">{hostH.hint}</p></div>
          <div className="grid sm:grid-cols-2 gap-4"><Field label="Engine"><Select value={f.engine} onChange={(e) => setF({ ...f, engine: e.target.value as Engine })}>{ENGINES.filter((e) => !((f.hosting === "vm" || f.hosting === "docker") && e.id === "spark")).map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</Select></Field><Field label="Region"><Input value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} /></Field></div>
          {f.engine === "flink" && (
            <div className="rounded-md border border-border p-4 space-y-4">
              <div><div className="text-[13px] font-medium mb-2">Which Flink</div>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {[[false, "Flink run by tok∑ner runners", "Runners start Flink for you on the hosting you chose above."], [true, "A Flink cluster I already run", "Jobs go to your own cluster. Use it when you already operate Flink, in the cloud or on your own machine."]].map(([v, t, h]) => (
                    <button key={String(v)} type="button" aria-pressed={ownFlink === v} onClick={() => setOwnFlink(v as boolean)} className={`text-left rounded-md border px-3.5 py-3 ${ownFlink === v ? "border-[#02F5A1] bg-accent-50" : "border-border hover:bg-surface-subtle"}`}><div className="text-[13px] font-medium">{t as string}</div><div className="text-xs text-text-secondary mt-0.5">{h as string}</div></button>))}
                </div></div>
              {ownFlink && <>
                <div><div className="text-[13px] font-medium mb-2">Where your cluster is</div>
                  <div className="grid sm:grid-cols-3 gap-2.5">{FLINK_PLACES.map((x) => <button key={x.id} type="button" aria-pressed={fl.location === x.id} onClick={() => { if (x.id === "local" && f.hosting !== "docker") setF({ ...f, hosting: "docker" }); setFl({ ...fl, location: x.id, restUrl: fl.restUrl || x.url, auth: x.id === "local" ? "none" : fl.auth === "none" ? "bearer" : fl.auth, deploy: x.id === "local" ? "session" : fl.deploy }); }} className={`text-left rounded-md border px-3 py-2.5 ${fl.location === x.id ? "border-[#02F5A1] bg-accent-50" : "border-border hover:bg-surface-subtle"}`}><div className="text-[13px] font-medium">{x.label}</div></button>)}</div>
                  <p className="text-xs text-text-secondary mt-2">{FLINK_PLACES.find((x) => x.id === fl.location)!.hint}</p></div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="How jobs are submitted" hint={DEPLOYS.find((d) => d.id === fl.deploy)!.hint}><Select value={fl.deploy} onChange={(e) => setFl({ ...fl, deploy: e.target.value as FlinkLink["deploy"] })} disabled={fl.location === "local"}>{DEPLOYS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</Select></Field>
                  <Field label="Flink REST address" hint={fl.restUrl && !flinkOk ? "Use an address that starts with http:// or https://" : "As the runner sees it, not as tok∑ner sees it"}><Input value={fl.restUrl} onChange={(e) => setFl({ ...fl, restUrl: e.target.value.trim() })} placeholder={FLINK_PLACES.find((x) => x.id === fl.location)!.url} aria-invalid={!!fl.restUrl && !flinkOk} /></Field>
                  <Field label="Sign in to the REST API"><Select value={fl.auth} onChange={(e) => setFl({ ...fl, auth: e.target.value as FlinkLink["auth"] })}><option value="none">None (inside a trusted network or on this computer)</option><option value="bearer">Bearer token</option><option value="mtls">Mutual TLS</option></Select></Field>
                  {fl.auth !== "none" && <Field label="Secret" hint="Stored as a secret reference. Give the value to the runner, not to the console."><Input value={fl.auth === "bearer" ? "secretref://vault/tenant/refinery/pools/<name>/token" : "client certificate and key, as secret references"} readOnly /></Field>}
                </div>
                <Notice tone="info" title="How the connection works">A runner next to your cluster connects out to tok∑ner, submits jobs to Flink with the address above, and reports their state and logs back. tok∑ner opens no connection into your cluster and your cluster needs no public address. {fl.location === "local" ? "Stop the runner and the pool shows as offline. Streams on it wait until the computer is back." : ""}</Notice>
                <p className="text-xs text-text-tertiary">The job runtime for Flink is a placeholder. Flink version support and the job package are not published yet.</p>
              </>}
            </div>)}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4"><Field label="Workers min"><Input type="number" min={1} value={f.workersMin} onChange={num("workersMin")} /></Field><Field label="Workers max" hint="Autoscale limit"><Input type="number" min={1} value={f.workersMax} onChange={num("workersMax")} /></Field><Field label="Cores each"><Input type="number" min={1} value={f.coresPerWorker} onChange={num("coresPerWorker")} /></Field><Field label="Memory GB each"><Input type="number" min={1} value={f.memGbPerWorker} onChange={num("memGbPerWorker")} /></Field><Field label="Runs at once"><Input type="number" min={1} value={f.concurrency} onChange={num("concurrency")} /></Field></div>
          <p className="text-xs text-text-tertiary">Total capacity at the limit: {f.workersMax * f.coresPerWorker} cores and {f.workersMax * f.memGbPerWorker} GB of memory. Workers are added when tasks wait and removed when they are idle.</p>
          {f.hosting !== "managed" && <Field label="Network note" hint="Where the runner sits, for example the VPC or cluster"><Input value={f.network} onChange={(e) => setF({ ...f, network: e.target.value })} placeholder="vpc-0a1b, private subnets" /></Field>}
        </div>
      )}
    </Modal>
  );
}
