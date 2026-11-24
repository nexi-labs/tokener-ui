"use client";

import { useState } from "react";
import { Check, Copy, Cpu, KeyRound, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Confirm, Drawer, KeyValue, Notice } from "@/components/mlops/ui";
import { Bar, PoolStatusBadge, Spark, ago, fmtInt } from "@/components/refinery/bits";
import { PoolWizard } from "@/components/refinery/PoolWizard";
import { NativeEnginePanel } from "@/components/refinery/NativeEnginePanel";
import { EdgeDialog } from "@/components/refinery/EdgeDialog";
import { markPoolOnline, refinery, useRefinery, useRefineryStatus } from "@/lib/refinery/store";
import { toast } from "@/lib/mlops/toast";
import type { RunnerPool } from "@/lib/refinery/types";

const ENGINE = { native: "Native engine", single: "Single node", spark: "Spark", flink: "Flink" } as const;
const HOST = { managed: "Managed", kubernetes: "Kubernetes", vm: "Virtual machine", docker: "Docker" } as const;

export default function RunnersPage() {
  const { pools: allPools, runs, recipes, connections } = useRefinery();
  const isLive = useRefineryStatus().mode === "live";
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) => { setBusy(true); const r = await fn(); setBusy(false); if (!r.ok) toast(r.error ?? "That did not work", "error"); else if (done) toast(done); return r.ok; };
  const pools = allPools.filter((x) => !x.builtIn);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [del, setDel] = useState<RunnerPool | null>(null);
  const [edge, setEdge] = useState<RunnerPool | null>(null);
  const [reenroll, setReenroll] = useState<RunnerPool | null>(null);
  const [issued, setIssued] = useState<{ pool: string; token: string; expiresAt: string | null; copied: boolean } | null>(null);
  const p = pools.find((x) => x.id === sel) ?? null;
  const online = pools.filter((x) => x.status === "online" || x.status === "scaling");
  const cores = online.reduce((a, x) => a + x.workers * x.coresPerWorker, 0);
  const mem = online.reduce((a, x) => a + x.workers * x.memGbPerWorker, 0);
  const running = pools.reduce((a, x) => a + x.running, 0); const queued = pools.reduce((a, x) => a + x.queued, 0);
  const kpi: [string, string, string][] = [["Pools online", `${online.length} of ${pools.length}`, "pending and offline pools are not counted"], ["Workers", fmtInt(online.reduce((a, x) => a + x.workers, 0)), `${fmtInt(cores)} cores, ${fmtInt(mem)} GB memory`], ["Runs active", fmtInt(running), "across all pools"], ["Runs waiting", fmtInt(queued), queued ? "waiting for capacity" : "nothing is waiting"]];
  const usedBy = (pool: RunnerPool) => ({ recipes: recipes.filter((r) => r.pool === pool.name).length, connections: connections.filter((c) => c.pool === pool.name).length, runs: runs.filter((r) => r.pool === pool.name).length });
  // a small made-up-free series: only the pool's current numbers are known, so draw nothing for history
  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div><h2 className="text-lg font-semibold tracking-tight">Runners</h2><p className="text-sm text-text-secondary mt-1 max-w-2xl">Work runs on the native engine built into tok∑ner, or on a runner pool. A runner pool is the group of workers that does the work. A recipe splits its input into partitions and the pool works through them in parallel, so a larger input needs more workers, not a longer wait. Pools you host connect out to tok∑ner, so your data stays in your network.</p></div>
        <Button variant="primary" onClick={() => setOpen(true)}><Plus size={15} /> New pool</Button>
      </div>
      <NativeEnginePanel />
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{kpi.map(([l, v, s]) => <Card key={l}><div className="p-4"><div className="text-xs text-text-tertiary">{l}</div><div className="text-xl font-semibold tabular-nums mt-1">{v}</div><div className="text-xs text-text-tertiary mt-0.5">{s}</div></div></Card>)}</div>
      <div className="grid lg:grid-cols-2 gap-4">
        {pools.map((x) => (
          <Card key={x.id}>
            <button type="button" onClick={() => setSel(x.id)} className="w-full text-left p-5 space-y-4 hover:bg-surface-subtle/60 rounded-lg">
              <div className="flex items-start gap-3"><span className="h-10 w-10 rounded-lg bg-[#07191E] text-[#02F5A1] grid place-items-center shrink-0"><Cpu size={18} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-[14px] font-semibold">{x.name}</span><PoolStatusBadge s={x.status} /></div><div className="text-xs text-text-tertiary mt-0.5">{HOST[x.hosting]}, {ENGINE[x.engine]}, {x.region}</div></div></div>
              <div className="grid grid-cols-3 gap-3 text-center">{[["Workers", `${x.workers} of ${x.workersMax}`], ["Running", String(x.running)], ["Waiting", String(x.queued)]].map(([l, v]) => <div key={l} className="rounded-md bg-surface-subtle py-2"><div className="text-[15px] font-semibold tabular-nums">{v}</div><div className="text-[11px] text-text-tertiary">{l}</div></div>)}</div>
              {x.status === "pending" ? <p className="text-xs text-text-secondary">Waiting for a runner to enroll with the token shown when the pool was created.</p> : (
                <div className="grid grid-cols-2 gap-4 text-xs"><div><div className="flex justify-between mb-1 text-text-secondary"><span>CPU</span><span className="tabular-nums">{Math.round(x.cpuPct)}%</span></div><Bar value={x.cpuPct} /></div><div><div className="flex justify-between mb-1 text-text-secondary"><span>Memory</span><span className="tabular-nums">{Math.round(x.memPct)}%</span></div><Bar value={x.memPct} /></div></div>)}
              <div className="text-[11px] text-text-tertiary flex flex-wrap gap-x-4 gap-y-1"><span>{x.coresPerWorker} cores and {x.memGbPerWorker} GB per worker</span><span>{x.concurrency} runs at once</span><span>version {x.version}</span><span>seen {ago(x.lastSeen)}</span></div>
            </button>
          </Card>))}
      </div>
      <EdgeDialog pool={edge} onClose={() => setEdge(null)} />
      <PoolWizard open={open} onClose={() => setOpen(false)} />
      <Drawer open={!!p} onClose={() => { setSel(null); setIssued(null); }} title={p?.name ?? ""} subtitle={p ? `${HOST[p.hosting]}, ${ENGINE[p.engine]}` : undefined}
        footer={p && <><Button variant="secondary" onClick={() => setDel(p)}><Trash2 size={14} /> Delete</Button>{p.status === "pending" && !isLive && <Button variant="primary" onClick={() => { markPoolOnline(p.id); toast("Runner enrolled (simulated)", "info"); }}>Simulate enrollment</Button>}</>}>
        {p && (
          <div className="space-y-5">
            <PoolStatusBadge s={p.status} />
            {p.status === "offline" && <Notice tone="warn" title="Runs wait while this pool is offline">No heartbeat for {ago(p.lastSeen)}. Check that the runner is running and can reach tok∑ner. Runs queue and start when it returns.</Notice>}
            {p.status !== "pending" && p.hosting !== "managed" && <Notice tone="info" title="Runs in your network">Data is read and written by this pool. tok∑ner sees counts, statistics and a bounded sample for the preview, never whole datasets.</Notice>}
            {isLive ? (
              <section><h3 className="text-[13px] font-semibold mb-2">Capacity</h3>
                <div className="grid grid-cols-2 gap-4">
                  {([["Fewest workers", p.workersMin, (v: number) => act(() => refinery.setWorkerRange(p, Math.max(0, v), Math.max(p.workersMax, v))), 0], ["Most workers", p.workersMax, (v: number) => act(() => refinery.setWorkerRange(p, Math.min(p.workersMin, v), Math.max(1, v))), 1]] as const).map(([label, val, set, floor]) => (
                    <div key={label} className="rounded-lg border border-border p-3">
                      <div className="text-xs text-text-tertiary mb-2">{label}</div>
                      <div className="flex items-center justify-between"><Button aria-label={`Fewer: ${label}`} disabled={busy || val <= floor} onClick={() => set(val - 1)}><Minus size={14} /></Button><span className="text-xl font-semibold tabular-nums">{val}</span><Button aria-label={`More: ${label}`} disabled={busy || val >= 1000} onClick={() => set(val + 1)}><Plus size={14} /></Button></div>
                    </div>))}
                </div>
                <p className="text-xs text-text-tertiary mt-2">{p.status === "pending" ? "No runner has enrolled yet." : `${p.workers} workers are reporting now.`} The pool scales on its own between these limits: up when tasks wait, down when workers are idle.</p></section>
            ) : (
            <section><h3 className="text-[13px] font-semibold mb-2">Capacity</h3>
              <div className="flex items-center gap-3"><Button aria-label="Remove a worker" onClick={() => refinery.resizePool(p, p.workers - 1)} disabled={p.status === "pending" || p.workers <= p.workersMin}><Minus size={14} /></Button><div className="text-center flex-1"><div className="text-2xl font-semibold tabular-nums">{p.workers}</div><div className="text-xs text-text-tertiary">workers now, {p.workersMin} to {p.workersMax} allowed</div></div><Button aria-label="Add a worker" onClick={() => refinery.resizePool(p, p.workers + 1)} disabled={p.status === "pending" || p.workers >= p.workersMax}><Plus size={14} /></Button></div>
              <p className="text-xs text-text-tertiary mt-2">Pools also scale on their own between the limits: up when tasks wait, down when workers are idle.</p></section>
            )}
            <section><h3 className="text-[13px] font-semibold mb-2">Details</h3><KeyValue rows={[["Hosting", HOST[p.hosting]], ["Engine", ENGINE[p.engine]], ["Region", p.region], ["Network", p.network], ["Each worker", `${p.coresPerWorker} cores, ${p.memGbPerWorker} GB`], ["Runs at once", String(p.concurrency)], ["Version", p.version], ["Last seen", ago(p.lastSeen)]]} /></section>
            {p.hosting !== "managed" && (
              <section><h3 className="text-[13px] font-semibold mb-1">Edge deployment</h3>
                <p className="text-xs text-text-secondary mb-2">For a plant with a weak or no link to the cloud: choose how connected the site is, see which pipelines can run there, and download an installer bundle.</p>
                <Button onClick={() => { setEdge(p); setSel(null); }}>Set up for the edge</Button></section>
            )}
            {isLive && p.hosting !== "managed" && (
              <section><h3 className="text-[13px] font-semibold mb-1">Runner enrollment</h3>
                <p className="text-xs text-text-secondary mb-2">If the runner was rebuilt or its credential was lost, issue a new enrollment token. The runner that holds the old credential stops working.</p>
                {issued?.pool === p.id ? (
                  <div className="space-y-2">
                    <Notice tone="warn" title="The token is shown once">Copy it now and give it to the runner. It enrolls one runner{issued.expiresAt ? ` and expires ${new Date(issued.expiresAt).toLocaleString()}` : ""}.</Notice>
                    <div className="flex items-center gap-2"><code className="flex-1 min-w-0 truncate rounded-md border border-border bg-surface-subtle px-3 py-2 text-xs">{issued.token}</code>
                      <Button aria-label="Copy token" onClick={() => { void navigator.clipboard?.writeText(issued.token); setIssued({ ...issued, copied: true }); }}>{issued.copied ? <Check size={14} /> : <Copy size={14} />}</Button></div>
                  </div>
                ) : <Button disabled={busy} onClick={() => setReenroll(p)}><KeyRound size={14} /> Issue new enrollment token</Button>}
              </section>
            )}
            <section><h3 className="text-[13px] font-semibold mb-2">Used by</h3><KeyValue rows={[["Recipes", String(usedBy(p).recipes)], ["Connections", String(usedBy(p).connections)], ["Runs on record", String(usedBy(p).runs)]]} /></section>
          </div>)}
      </Drawer>
      <Confirm open={!!reenroll} onClose={() => setReenroll(null)} title={`Issue a new token for ${reenroll?.name}?`} body="The runner that is enrolled now loses its credential and the pool returns to pending until a runner enrolls with the new token." confirmLabel="Issue token" onConfirm={async () => {
        const target = reenroll; setReenroll(null); if (!target) return;
        setBusy(true); const r = await refinery.reenrollPool(target.id); setBusy(false);
        if (!r.ok) toast(r.error ?? "That did not work", "error"); else if (r.token) setIssued({ pool: target.id, token: r.token, expiresAt: r.expiresAt, copied: false });
      }} />
      <Confirm open={!!del} onClose={() => setDel(null)} danger title={`Delete ${del?.name}?`} body="Recipes and connections that use this pool will need another one. Runs on record are kept." confirmLabel="Delete pool" onConfirm={async () => { if (del && (await act(() => refinery.removePool(del.id), "Pool deleted"))) setSel(null); setDel(null); }} />
    </div>
  );
}
