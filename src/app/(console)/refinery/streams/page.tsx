"use client";

import { useState } from "react";
import { Pause, Play, Plus, Radio } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Drawer, KeyValue, Notice } from "@/components/mlops/ui";
import { Spark, StreamStatusBadge, fmtDur, fmtInt } from "@/components/refinery/bits";
import { StreamWizard } from "@/components/refinery/StreamWizard";
import { refinery, useRefinery, useRefineryStatus } from "@/lib/refinery/store";
import { toast } from "@/lib/mlops/toast";
import type { StreamJob } from "@/lib/refinery/types";

const MODE = { append: "Appends every change", upsert: "Keeps the latest row per key", mirror: "Mirrors the source, deletes included" } as const;
const lagAge = (s: StreamJob) => (s.outRate > 0 ? Math.round(s.lag / Math.max(1, s.outRate)) : null);

export default function StreamsPage() {
  const { streams } = useRefinery();
  const isLive = useRefineryStatus().mode === "live";
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const s = streams.find((x) => x.id === sel) ?? null;
  const live = streams.filter((x) => x.status === "running" || x.status === "snapshotting");
  const kpi: [string, string, string][] = [["Streams running", `${live.length} of ${streams.length}`, "paused and failed ones are not counted"], ["Records in", `${fmtInt(live.reduce((a, x) => a + x.inRate, 0))} per second`, "all running streams together"], ["Dead letters", fmtInt(streams.reduce((a, x) => a + x.deadLetters, 0)), "records set aside with a reason"], ["Behind", fmtInt(streams.reduce((a, x) => a + x.lag, 0)), "records waiting to be processed"]];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div><h2 className="text-lg font-semibold tracking-tight">Streams</h2><p className="text-sm text-text-secondary mt-1 max-w-2xl">Clean data as it arrives. A stream reads from a streaming system such as Kafka, AutoMQ, Redpanda, RabbitMQ, Pulsar, NATS, Kinesis, Pub/Sub or Event Hubs, or from the change log of a database with Debezium. It runs a recipe on every record and writes to a file store such as S3 or MinIO, a database table or another topic or queue. Updates and deletes at the source can be carried to the destination.</p></div>
        <Button variant="primary" onClick={() => setOpen(true)}><Plus size={15} /> New stream</Button>
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{kpi.map(([l, v, d]) => <Card key={l}><div className="p-4"><div className="text-xs text-text-tertiary">{l}</div><div className="text-xl font-semibold tabular-nums mt-1">{v}</div><div className="text-xs text-text-tertiary mt-0.5">{d}</div></div></Card>)}</div>
      <div className="space-y-3">
        {streams.map((x) => (
          <Card key={x.id}>
            <div className="p-5 grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] gap-x-8 gap-y-4 items-center">
              <button type="button" onClick={() => setSel(x.id)} className="text-left min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="h-8 w-8 rounded-md bg-[#07191E] text-[#02F5A1] grid place-items-center"><Radio size={15} /></span><span className="text-[14px] font-semibold">{x.name}</span><StreamStatusBadge s={x.status} /><span className="text-[11px] uppercase tracking-wide rounded-full border border-border px-2 py-0.5 text-text-tertiary">{x.kind === "cdc" ? "Change capture" : x.system ?? "Messaging"}</span></div>
                <div className="text-xs text-text-secondary mt-2 truncate">{x.source}</div><div className="text-xs text-text-tertiary truncate">to {x.sink}</div>
                <div className="text-xs text-text-tertiary mt-1">Recipe {x.recipeName}{x.mode ? `, ${MODE[x.mode].toLowerCase()}` : ""}</div>
              </button>
              <div className="grid grid-cols-4 gap-3 text-center">{[["In per s", fmtInt(x.inRate)], ["Out per s", fmtInt(x.outRate)], ["Behind", fmtInt(x.lag)], ["Latency", x.latencyMs ? `${x.latencyMs} ms` : "none"]].map(([l, v]) => <div key={l}><div className="text-[15px] font-semibold tabular-nums">{v}</div><div className="text-[11px] text-text-tertiary">{l}</div></div>)}</div>
              <div className="flex items-center gap-3 justify-end"><Spark data={x.series.map((p) => p.inRate)} width={120} height={34} />
                {x.status === "paused" ? <Button aria-label={`Resume ${x.name}`} onClick={async () => { const r = await refinery.setStreamStatus(x.id, "running"); if (!r.ok) toast(r.error, "error"); }}><Play size={14} /> Resume</Button> : <Button aria-label={`Pause ${x.name}`} onClick={async () => { const r = await refinery.setStreamStatus(x.id, "paused"); if (!r.ok) toast(r.error, "error"); }} disabled={x.status === "starting"}><Pause size={14} /> Pause</Button>}</div>
            </div>
          </Card>))}
        {streams.length === 0 && <Card><div className="p-10 text-center text-sm text-text-secondary">No streams yet. Create one to clean records as they arrive.</div></Card>}
      </div>
      <p className="text-xs text-text-tertiary">{isLive ? "Figures are reported by the stream's runner every few seconds. A stream stays starting until its runner reports." : "Figures here are samples. A real stream reports from its runner every few seconds."}</p>
      <StreamWizard open={open} onClose={() => setOpen(false)} />
      <Drawer open={!!s} onClose={() => setSel(null)} title={s?.name ?? ""} subtitle={s ? `${s.kind === "cdc" ? "Change capture" : s.system ?? "Messaging"} on ${s.pool}` : undefined}>
        {s && (
          <div className="space-y-5">
            <StreamStatusBadge s={s.status} />
            {s.status === "snapshotting" && <Notice tone="info" title="Copying the existing rows">The stream is reading what is already in the tables. It switches to live changes when that is finished, without gaps or repeats.</Notice>}
            {s.checkpointAgeS > 600 && s.status === "paused" && <Notice tone="warn" title="Paused">It resumes from its last checkpoint, {fmtDur(s.checkpointAgeS * 1000)} ago. Records that arrived since are waiting.</Notice>}
            <section><h3 className="text-[13px] font-semibold mb-2">Throughput, last 30 minutes</h3><div className="rounded-md border border-border p-3 space-y-3">{[["In per second", s.series.map((p) => p.inRate)], ["Out per second", s.series.map((p) => p.outRate)], ["Records behind", s.series.map((p) => p.lag)]].map(([l, d]) => <div key={l as string} className="flex items-center justify-between gap-3"><span className="text-xs text-text-secondary">{l as string}</span><Spark data={d as number[]} width={220} height={32} /></div>)}</div></section>
            <section><h3 className="text-[13px] font-semibold mb-2">Health</h3><KeyValue rows={[["Latency", s.latencyMs ? `${s.latencyMs} ms` : "none"], ["Time to catch up", lagAge(s) === null ? "not running" : `about ${fmtDur((lagAge(s) ?? 0) * 1000)}`], ["Last checkpoint", `${fmtDur(s.checkpointAgeS * 1000)} ago`], ["Rejected by rules", `${s.errPct}%`], ["Dead letters", fmtInt(s.deadLetters)]]} /></section>
            <section><h3 className="text-[13px] font-semibold mb-2">Setup</h3><KeyValue rows={[["Reads from", s.source], ["Recipe", s.recipeName], ["Writes to", s.sink], ["Changes", s.mode ? MODE[s.mode] : "Appends every change"], ...(s.primaryKey ? [["Key", s.primaryKey] as [string, string]] : []), ["Delivery", s.delivery.replace("-", " ")], ["New source columns", s.schemaEvolution === "stop" ? "Stop and alert" : "Added to the destination"], ...(s.snapshot !== undefined ? [["Initial snapshot", s.snapshot ? "Yes" : "No, changes only"] as [string, string]] : [])]} /></section>
          </div>)}
      </Drawer>
    </div>
  );
}
