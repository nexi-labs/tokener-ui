"use client";

import clsx from "clsx";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { Modal, Notice } from "@/components/mlops/ui";
import { ConnectorMark } from "@/components/refinery/bits";
import { CONNECTOR_BY_ID } from "@/lib/refinery/connectors";
import { STEP_BY_OP } from "@/lib/refinery/steps";
import { nativeStreamCheck, refinery, useRefinery, useRefineryStatus } from "@/lib/refinery/store";
import type { StreamJob } from "@/lib/refinery/types";
import { toast } from "@/lib/mlops/toast";

const STEPS = ["Source", "Recipe", "Destination", "Delivery"];
type Mode = NonNullable<StreamJob["mode"]>;
const MODES: { id: Mode; label: string; what: string }[] = [
  { id: "append", label: "Append every change", what: "Each insert, update and delete is written as a new row with the operation and its time. Nothing is overwritten. Best for history and for training on how data changed." },
  { id: "upsert", label: "Keep the latest row per key", what: "An update replaces the row with the same key and an insert adds one. Deletes are ignored. The destination looks like a copy of the table, without removed rows going away." },
  { id: "mirror", label: "Mirror the source, deletes included", what: "The destination matches the source: inserts add, updates replace and deletes remove the row. Needs a key." },
];

/** Set up a stream: read from a streaming system (Kafka, AutoMQ, Redpanda, RabbitMQ, Pulsar, NATS, Kinesis, Pub/Sub, Event Hubs, MQTT and others) or from database change capture (Debezium), run a recipe on every record, write to a file store, a table or a topic or queue. */
export function StreamWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { connections, recipes, pools, streams } = useRefinery();
  const isLive = useRefineryStatus().mode === "live";
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [src, setSrc] = useState(""); const [what, setWhat] = useState(""); const [snap, setSnap] = useState(true); const [startFrom, setStartFrom] = useState<"earliest" | "latest">("latest");
  const [recipeId, setRecipeId] = useState("");
  const [dest, setDest] = useState(""); const [path, setPath] = useState(""); const [fmt, setFmt] = useState("parquet"); const [flush, setFlush] = useState(300);
  const [mode, setMode] = useState<Mode>("append"); const [pk, setPk] = useState(""); const [delivery, setDelivery] = useState<StreamJob["delivery"]>("at-least-once"); const [evo, setEvo] = useState<"add-columns" | "stop">("add-columns");
  const [pool, setPool] = useState(""); const [engineKind, setEngineKind] = useState<"native" | "flink" | "own">("native"); const [rate, setRate] = useState(500);

  const sources = connections.filter((c) => { const k = CONNECTOR_BY_ID.get(c.connector); return c.connector.startsWith("cdc") || (!!k?.messaging && k.can.includes("source")); });
  const sc = sources.find((c) => c.id === src); const sk = sc ? CONNECTOR_BY_ID.get(sc.connector) : null; const isCdc = sc?.connector.startsWith("cdc"); const msg = sk?.messaging;
  const dests = connections.filter((c) => CONNECTOR_BY_ID.get(c.connector)?.can.includes("sink"));
  const dc = dests.find((c) => c.id === dest); const dk = dc ? CONNECTOR_BY_ID.get(dc.connector) : null;
  const destKind: "files" | "table" | "stream" | null = !dk ? null : dk.messaging ? "stream" : dk.group === "Object storage" || dk.group === "Files and APIs" ? "files" : "table";
  const recipe = recipes.find((r) => r.id === recipeId);
  const batchOnly = recipe ? recipe.steps.filter((s) => STEP_BY_OP.get(s.op)?.streamable === false).map((s) => STEP_BY_OP.get(s.op)!.label) : [];
  const nativePool = pools.find((p) => p.engine === "native");
  const flinkPools = pools.filter((p) => p.engine === "flink" && !p.flink);
  const ownPools = pools.filter((p) => p.engine === "flink" && !!p.flink);
  const nativeCheck = nativeStreamCheck(rate);
  const effPool = engineKind === "native" ? nativePool?.name ?? "" : pool;
  const needsKey = mode !== "append";
  // Exactly once needs both ends to support it. A queue, an MQTT broker and several cloud logs cannot promise it end to end.
  const eoBlockers = [msg && !msg.exactlyOnce ? sk!.name : "", dk?.messaging && !dk.messaging.exactlyOnce ? dk.name : ""].filter(Boolean);
  const eoOk = eoBlockers.length === 0;
  const nameErr = name && !/^[a-z][a-z0-9-]{1,48}$/.test(name) ? "Start with a letter. Use lower case letters, digits and hyphens." : streams.some((s) => s.name === name) ? "A stream with this name exists." : null;
  const stepOk = [!!name && !nameErr && !!sc && !!what.trim(), !!recipe && batchOnly.length === 0, !!dc && !!path.trim(), (!needsKey || !!pk.trim()) && !!effPool && (engineKind !== "native" || nativeCheck.verdict !== "refused")][step];
  const reset = () => { setStartFrom("latest"); setStep(0); setName(""); setSrc(""); setWhat(""); setSnap(true); setRecipeId(""); setDest(""); setPath(""); setFmt("parquet"); setFlush(300); setMode("append"); setPk(""); setDelivery("at-least-once"); setEvo("add-columns"); setPool(""); setEngineKind("native"); setRate(500); };
  const close = () => { reset(); onClose(); };
  const fileNote = destKind === "files" && mode !== "append" ? "Files cannot be edited in place. Upsert and mirror write new files and merge them with the earlier ones on each flush, which needs a table format such as Apache Iceberg. Until that is set up, choose append for files, or write to a table." : null;
  const [saving, setSaving] = useState(false); const [err, setErr] = useState<string | null>(null);
  const create = async () => {
    if (saving) return; setSaving(true); setErr(null);
    const made = await refinery.createStream({ name, kind: isCdc ? "cdc" : "messaging", system: isCdc ? undefined : sk?.name, startFrom: msg?.replay ? startFrom : undefined, recipeName: recipe!.name, source: `${sc!.name} / ${what.split("\n").map((x) => x.trim()).filter(Boolean).join(", ")}`, sink: `${dc!.name} / ${path}${destKind === "files" ? ` (${fmt}, rolled every ${flush} seconds)` : ""}`, pool: effPool, delivery: eoOk ? delivery : "at-least-once", mode, primaryKey: needsKey ? pk : undefined, destKind: destKind!, snapshot: isCdc ? snap : undefined, flushSeconds: flush, schemaEvolution: evo });
    setSaving(false);
    if (!made.ok) { setErr(made.error); return; }
    toast(isLive ? `Stream ${name} created` : `Stream ${name} started (simulated)`, "info"); close();
  };

  return (
    <Modal open={open} onClose={close} title="New stream" wide
      footer={<><Button onClick={step === 0 ? close : () => setStep(step - 1)}>{step === 0 ? "Cancel" : "Back"}</Button>{step < 3 ? <Button variant="primary" disabled={!stepOk} onClick={() => setStep(step + 1)}>Next <ArrowRight size={14} /></Button> : <Button variant="primary" disabled={!stepOk || saving} onClick={create}>{saving ? "Starting" : "Start stream"}</Button>}</>}>
      <ol className="flex items-center gap-2 mb-5 text-xs">{STEPS.map((s, k) => <li key={s} className={clsx("flex items-center gap-2", k <= step ? "text-text-primary" : "text-text-tertiary")}><span className={clsx("h-5 w-5 rounded-full grid place-items-center text-[11px]", k < step ? "bg-[#02F5A1] text-[#07191E]" : k === step ? "bg-[#07191E] text-white" : "bg-surface-muted")}>{k < step ? <Check size={11} /> : k + 1}</span>{s}{k < 3 && <span className="w-6 h-px bg-border" />}</li>)}</ol>

      {err && <Notice tone="bad" title="The stream was not created">{err}</Notice>}
      {step === 0 && (
        <div className="space-y-5">
          <Field label="Name" hint={nameErr ?? "Lower case letters, digits and hyphens"}><Input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="orders-clean-sync" /></Field>
          <div><div className="text-[13px] font-medium mb-2">Read from</div>
            {sources.length === 0 ? <Notice tone="warn">Add a streaming or change capture connection first. Kafka, AutoMQ, Redpanda, RabbitMQ, Pulsar, NATS, Kinesis, Pub/Sub, Event Hubs, MQTT, ActiveMQ, RocketMQ, SQS and database change capture are supported.</Notice> : <div className="grid sm:grid-cols-2 gap-2.5">{sources.map((c) => <button key={c.id} type="button" aria-pressed={src === c.id} onClick={() => { setSrc(c.id); setWhat(""); setStartFrom(CONNECTOR_BY_ID.get(c.connector)?.messaging?.replay ? "latest" : "latest"); }} className={clsx("flex items-center gap-3 text-left rounded-md border px-3.5 py-3", src === c.id ? "border-[#02F5A1] bg-accent-50" : "border-border hover:bg-surface-subtle")}><ConnectorMark id={c.connector} size={32} /><div className="min-w-0"><div className="text-[13px] font-medium truncate">{c.name}</div><div className="text-xs text-text-tertiary">{CONNECTOR_BY_ID.get(c.connector)?.name}</div></div></button>)}</div>}</div>
          {sc && (
            <div className="space-y-4">
              <Field label={isCdc ? "Tables to follow" : msg?.unit ?? "Topic"} hint={isCdc ? "One per line, as schema.table. Each table's inserts, updates and deletes are read from the database log (Debezium), without querying the table." : `For example ${msg?.example ?? "events.*"}`}>{isCdc ? <textarea rows={3} value={what} onChange={(e) => setWhat(e.target.value)} placeholder={"public.orders\npublic.order_items"} className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-code" /> : <Input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="support.tickets.raw" />}</Field>
              {msg && <Notice tone="info" title={`How ${sk?.name} behaves`}>{msg.semantics} Order: {msg.order.toLowerCase()}.</Notice>}
              {msg?.replay && <Field label="Start reading from" hint="Applies the first time the stream runs. After that it continues from where it stopped."><Select value={startFrom} onChange={(e) => setStartFrom(e.target.value as "earliest" | "latest")}><option value="latest">New records only</option><option value="earliest">The oldest record that is still kept</option></Select></Field>}
              {isCdc && <Toggle checked={snap} onChange={setSnap} label="Copy the existing rows first" description="An initial snapshot reads what is in the tables now, then switches to the log without gaps or repeats. Turn off to start from changes only." />}
              {isCdc && <Notice tone="info" title="What the database needs">Logical replication on (PostgreSQL) or the binary log in row format (MySQL), and a user that may read it. {sk?.name} lists the exact settings.</Notice>}
            </div>)}
        </div>)}

      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">Every record goes through this recipe before it is written. Only steps that work one record at a time can run in a stream.</p>
          <div className="space-y-2">{recipes.map((r) => { const bad = r.steps.filter((s) => STEP_BY_OP.get(s.op)?.streamable === false); return (
            <button key={r.id} type="button" disabled={bad.length > 0} aria-pressed={recipeId === r.id} onClick={() => setRecipeId(r.id)} className={clsx("w-full text-left rounded-md border px-3.5 py-3", recipeId === r.id ? "border-[#02F5A1] bg-accent-50" : "border-border hover:bg-surface-subtle", bad.length > 0 && "opacity-55 cursor-not-allowed hover:bg-transparent")}>
              <div className="flex items-center gap-2"><span className="text-[13px] font-medium">{r.name}</span><span className="text-xs text-text-tertiary">{r.steps.length} steps</span></div>
              <div className="text-xs text-text-secondary mt-0.5">{bad.length ? `Batch only: ${bad.map((s) => STEP_BY_OP.get(s.op)!.label).join(", ")}` : r.description}</div></button>); })}</div>
          {recipes.every((r) => r.steps.some((s) => STEP_BY_OP.get(s.op)?.streamable === false)) && <Notice tone="warn">Every recipe has a step that needs all rows. Create a recipe from steps that work on one record at a time.</Notice>}
        </div>)}

      {step === 2 && (
        <div className="space-y-5">
          <div><div className="text-[13px] font-medium mb-2">Write to</div><div className="grid sm:grid-cols-2 gap-2.5">{dests.map((c) => <button key={c.id} type="button" aria-pressed={dest === c.id} onClick={() => { setDest(c.id); setPath(""); }} className={clsx("flex items-center gap-3 text-left rounded-md border px-3.5 py-3", dest === c.id ? "border-[#02F5A1] bg-accent-50" : "border-border hover:bg-surface-subtle")}><ConnectorMark id={c.connector} size={32} /><div className="min-w-0"><div className="text-[13px] font-medium truncate">{c.name}</div><div className="text-xs text-text-tertiary">{CONNECTOR_BY_ID.get(c.connector)?.name}</div></div></button>)}</div></div>
          {dc && <>
            <Field label={destKind === "files" ? "Folder" : destKind === "table" ? "Table" : dk?.messaging?.sinkUnit ?? dk?.messaging?.unit ?? "Topic"} hint={destKind === "files" ? "Files are grouped by day. In MinIO or S3 this is a path inside the bucket." : destKind === "table" ? "Created if it does not exist. Columns follow the recipe's output." : undefined}><Input value={path} onChange={(e) => setPath(e.target.value)} placeholder={destKind === "files" ? "curated/orders/" : destKind === "table" ? "analytics.orders_clean" : "orders.clean"} /></Field>
            {destKind === "files" && <div className="grid grid-cols-2 gap-4"><Field label="File format" hint="Parquet for tables, JSON Lines for text and fine tuning"><Select value={fmt} onChange={(e) => setFmt(e.target.value)}><option>parquet</option><option>jsonl</option><option>csv</option></Select></Field><Field label="Start a new file every" hint="Seconds. Small files are slow to read later."><Input type="number" min={5} value={flush} onChange={(e) => setFlush(Math.max(5, Number(e.target.value) || 5))} /></Field></div>}
          </>}
        </div>)}

      {step === 3 && (
        <div className="space-y-5">
          <div><div className="text-[13px] font-medium mb-2">How changes reach the destination</div><div className="space-y-2">{MODES.map((m) => <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)} className={clsx("w-full text-left rounded-md border px-3.5 py-3", mode === m.id ? "border-[#02F5A1] bg-accent-50" : "border-border hover:bg-surface-subtle")}><div className="text-[13px] font-medium">{m.label}</div><div className="text-xs text-text-secondary mt-0.5">{m.what}</div></button>)}</div></div>
          {needsKey && <Field label="Key column" hint={isCdc ? "The primary key of the source table, as it is after the recipe" : "A column that identifies a row"}><Input value={pk} onChange={(e) => setPk(e.target.value)} placeholder="order_id" /></Field>}
          {fileNote && <Notice tone="warn" title="Files and updates">{fileNote}</Notice>}
          {destKind === "table" && needsKey && <p className="text-xs text-text-tertiary">Written with an upsert statement on the key (INSERT ... ON CONFLICT or MERGE), and a delete for removed rows in mirror mode.</p>}
          {destKind === "stream" && mode === "mirror" && <p className="text-xs text-text-tertiary">{dk?.messaging?.family === "log" && (dk.id !== "rocketmq") ? "Deletes are written as a record with the key and an empty value, so a compacted topic drops the row." : `Deletes are written as a record with the key and an empty value. ${dk?.name} does not compact by key, so readers of the destination must handle that record themselves.`}</p>}
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Delivery" hint="At least once can repeat a record after a restart. Exactly once is transactional and slower."><Select value={eoOk ? delivery : "at-least-once"} onChange={(e) => setDelivery(e.target.value as StreamJob["delivery"])}><option value="at-least-once">At least once</option><option value="exactly-once" disabled={!eoOk}>Exactly once{eoOk ? "" : " (not available)"}</option></Select>{!eoOk && <p className="text-xs text-text-tertiary mt-1.5">{eoBlockers.join(" and ")} cannot promise exactly once end to end, so repeats are possible after a restart. Make the destination idempotent by choosing a key, or use a system that supports transactions.</p>}</Field>
            <Field label="When the source adds a column"><Select value={evo} onChange={(e) => setEvo(e.target.value as "add-columns" | "stop")}><option value="add-columns">Add it to the destination</option><option value="stop">Stop and alert me</option></Select></Field>
          </div>
          <div>
            <div className="text-[13px] font-medium mb-2">Engine</div>
            <div className="space-y-2">
              {([["native", "Native engine", "Runs in the tok∑ner backend on virtual threads. Nothing to install. It has limits on how many streams run and how fast each reads.", !!nativePool], ["flink", "Flink on tok∑ner runners", "A Flink pool that tok∑ner runners operate. For high rates, state and long windows.", flinkPools.length > 0], ["own", "My own Flink cluster", "A Flink cluster you already run, in the cloud or on your own machine. A runner next to it submits the job.", ownPools.length > 0]] as const).map(([id, t, h, has]) => (
                <button key={id} type="button" disabled={!has} aria-pressed={engineKind === id} onClick={() => { setEngineKind(id); setPool(""); }} className={clsx("w-full text-left rounded-md border px-3.5 py-3", engineKind === id ? "border-[#02F5A1] bg-accent-50" : "border-border hover:bg-surface-subtle", !has && "opacity-55 cursor-not-allowed hover:bg-transparent")}>
                  <div className="flex items-center gap-2"><span className="text-[13px] font-medium">{t}</span>{id === "native" && <span className="text-[10.5px] uppercase tracking-wide rounded-full border border-border px-2 py-0.5 text-text-tertiary">Default</span>}</div>
                  <div className="text-xs text-text-secondary mt-0.5">{h}{!has ? " No such pool yet. Create one on the Runners screen." : ""}</div>
                </button>))}
            </div>
          </div>
          {engineKind === "native" && <>
            <Field label="Records per second you expect" hint="Used to check the native engine limits. A rough figure is enough."><Input type="number" min={1} value={rate} onChange={(e) => setRate(Math.max(1, Math.round(Number(e.target.value) || 1)))} /></Field>
            {nativeCheck.verdict === "refused" ? <Notice tone="bad" title="The native engine cannot take this stream">{nativeCheck.reasons[0]} Choose Flink.</Notice> : <p className="text-xs text-text-tertiary">{nativeCheck.reasons[0]}</p>}
          </>}
          {engineKind !== "native" && <Field label={engineKind === "own" ? "Your Flink cluster" : "Runner pool"} hint={engineKind === "own" ? "The pool whose runner sits next to your cluster" : "A pool of Flink workers"}><Select value={pool} onChange={(e) => setPool(e.target.value)}><option value="">Choose a pool</option>{(engineKind === "own" ? ownPools : flinkPools).map((p) => <option key={p.id} value={p.name} disabled={p.status === "pending"}>{p.name}{p.flink ? `, ${p.flink.location === "local" ? "this computer" : p.flink.location === "cloud" ? "cloud" : "on premises"}` : ""}{p.status !== "online" ? `, ${p.status}` : ""}</option>)}</Select></Field>}
          <div className="rounded-md border border-border bg-surface-subtle px-4 py-3 text-xs text-text-secondary space-y-1"><div className="font-semibold text-[13px] text-text-primary mb-1">Summary</div><div>{sc?.name} / {what.split("\n").filter(Boolean).join(", ")} to {recipe?.name} to {dc?.name} / {path}</div><div>{MODES.find((m) => m.id === mode)?.label}{needsKey && pk ? ` on ${pk}` : ""}, {(eoOk ? delivery : "at-least-once").replace("-", " ")}, on {engineKind === "native" ? "the native engine" : effPool || "a Flink pool"}{isCdc ? snap ? ", with an initial snapshot" : ", changes only" : ""}.</div><div>Records that fail a rule go to a dead letter location, never silently dropped.</div></div>
        </div>)}
    </Modal>
  );
}
