"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Kpi, Notice, Tabs } from "@/components/mlops/ui";
import { AUTH_SCHEMES, ERROR_CODES, EXCHANGES, MAX_DEPTH, MEDIA_TYPE, MESSAGES, MESSAGE_TYPES, MODES, PROTOCOLS, TAP_VERSION, TASK_STATES, exampleEnvelope, generateSigningKey, signEnvelope, signingAvailable, validateEnvelope, verifyEnvelope, type Exchange, type Field, type ProtocolId } from "@/lib/agents/protocol";

type Tab = "stack" | "messages" | "exchanges" | "validate" | "errors";
const pretty = (v: unknown) => JSON.stringify(v, null, 2);
const typeOf = (f: Field) => f.type === "enum" ? (f.values ?? []).join(" | ") : f.type === "array" ? `${f.items?.type ?? "any"}[]` : f.type;

export default function ProtocolsPage() {
  const [tab, setTab] = useState<Tab>("stack");
  return (
    <>
      <div className="mb-6"><h1 className="text-xl font-semibold tracking-tight">Protocols</h1><p className="text-sm text-text-secondary mt-1 max-w-2xl">The tok∑ner Agent Protocol family (TAP, version {TAP_VERSION}): six small protocols that share one signed envelope. This page is the reference and a checker for messages you build.</p></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6"><Kpi label="Protocols" value={PROTOCOLS.length} /><Kpi label="Message types" value={MESSAGE_TYPES.length} /><Kpi label="Error codes" value={ERROR_CODES.length} /><Kpi label="Maximum delegation depth" value={MAX_DEPTH} /></div>
      <Notice tone="warn" title="Specification and checker only">The protocol is specified in doc 48 and checked here in the browser. The TAP gateway and broker, SDKs and transports are not built, so nothing on this page talks to a live agent.</Notice>
      <div className="mt-5"><Tabs<Tab> label="Protocol sections" value={tab} onChange={setTab} tabs={[{ id: "stack", label: "The family" }, { id: "messages", label: "Messages", count: MESSAGE_TYPES.length }, { id: "exchanges", label: "Exchanges", count: EXCHANGES.length }, { id: "validate", label: "Check a message" }, { id: "errors", label: "Errors", count: ERROR_CODES.length }]} /></div>
      <div className="pt-5">{tab === "stack" && <Stack />}{tab === "messages" && <Messages />}{tab === "exchanges" && <Exchanges />}{tab === "validate" && <Validate />}{tab === "errors" && <Errors />}</div>
    </>
  );
}

function Stack() {
  return (
    <div className="space-y-5">
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{PROTOCOLS.map((p) => (
        <Card key={p.id}><CardBody className="space-y-2"><div className="flex items-baseline justify-between"><h3 className="text-base font-semibold">{p.name}</h3><span className="text-xs text-text-tertiary">{p.does}</span></div><p className="text-sm text-text-secondary">{p.long}</p><p className="text-xs text-text-tertiary">Like {p.counterpart}. {Object.keys(MESSAGES).filter((m) => MESSAGES[m].protocol === p.id).length} message types.</p></CardBody></Card>))}</div>
      <Card><CardHeader title="Shared vocabulary" /><CardBody className="grid sm:grid-cols-2 gap-5 text-sm">
        <div><div className="text-xs text-text-tertiary mb-1">Media type</div><code className="font-mono text-[13px]">{MEDIA_TYPE}</code></div>
        <div><div className="text-xs text-text-tertiary mb-1">Call modes</div><div className="flex flex-wrap gap-1.5">{MODES.map((m) => <Badge key={m}>{m}</Badge>)}</div></div>
        <div><div className="text-xs text-text-tertiary mb-1">Task states</div><div className="flex flex-wrap gap-1.5">{TASK_STATES.map((m) => <Badge key={m}>{m}</Badge>)}</div></div>
        <div><div className="text-xs text-text-tertiary mb-1">Authentication</div><div className="flex flex-wrap gap-1.5">{AUTH_SCHEMES.map((m) => <Badge key={m}>{m}</Badge>)}</div></div>
      </CardBody></Card>
    </div>
  );
}

function Messages() {
  const [pid, setPid] = useState<ProtocolId>("relay"); const types = MESSAGE_TYPES.filter((t) => MESSAGES[t].protocol === pid); const [sel, setSel] = useState(types[0]);
  const type = types.includes(sel) ? sel : types[0]; const m = MESSAGES[type]; const ex = useMemo(() => exampleEnvelope(type), [type]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">{PROTOCOLS.map((p) => <button key={p.id} aria-pressed={pid === p.id} onClick={() => { setPid(p.id); setSel(MESSAGE_TYPES.find((t) => MESSAGES[t].protocol === p.id)!); }} className={clsx("h-8 rounded-full border px-3 text-[13px]", pid === p.id ? "bg-[#07191E] border-[#07191E] text-white" : "border-border-strong hover:bg-surface-muted")}>{p.name}</button>)}</div>
      <div className="grid lg:grid-cols-[280px_1fr] gap-5 items-start">
        <Card><ul className="divide-y divide-border">{types.map((t) => <li key={t}><button onClick={() => setSel(t)} aria-current={type === t} className={clsx("w-full text-left px-4 py-3 hover:bg-surface-subtle", type === t && "bg-surface-subtle")}><div className="font-mono text-[13px]">{t}</div><div className="text-xs text-text-tertiary mt-0.5">{MESSAGES[t].direction}</div></button></li>)}</ul></Card>
        <div className="space-y-5">
          <Card><CardHeader title={type} subtitle={m.summary} action={m.reply ? <span className="text-xs text-text-tertiary">Reply: <code className="font-mono">{m.reply}</code></span> : undefined} />
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-text-tertiary border-b border-border"><th className="px-5 py-2.5 font-medium">Field</th><th className="px-3 font-medium">Type</th><th className="px-3 font-medium">Required</th><th className="px-3 font-medium">Meaning</th></tr></thead>
              <tbody className="divide-y divide-border">{m.payload.map((f) => <tr key={f.key}><td className="px-5 py-2.5 font-mono text-[13px]">{f.key}</td><td className="px-3 text-text-secondary">{typeOf(f)}</td><td className="px-3">{f.required ? "Yes" : ""}</td><td className="px-3 text-text-secondary">{f.help}</td></tr>)}{m.payload.length === 0 && <tr><td colSpan={4} className="px-5 py-5 text-text-secondary">No payload.</td></tr>}</tbody></table></div></Card>
          <Card><CardHeader title="Example envelope" /><CardBody><pre className="text-xs font-mono overflow-auto max-h-80 rounded-md bg-surface-muted p-4">{pretty(ex)}</pre></CardBody></Card>
        </div>
      </div>
    </div>
  );
}

function Sequence({ x }: { x: Exchange }) {
  const n = x.actors.length; const W = 760; const col = (i: number) => 90 + i * ((W - 180) / Math.max(1, n - 1)); const H = 70 + x.steps.length * 44;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: W }} className="w-full" role="img" aria-label={x.title}>
      <defs><marker id="seq-a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="rgb(var(--c-text-secondary))" /></marker></defs>
      {x.actors.map((a, i) => <g key={a}><text x={col(i)} y={24} textAnchor="middle" fontSize={13} fontWeight={600} fill="rgb(var(--c-text-primary))">{a}</text><line x1={col(i)} y1={36} x2={col(i)} y2={H - 8} stroke="rgb(var(--c-border-strong))" strokeDasharray="3 5" /></g>)}
      {x.steps.map((s, i) => { const y = 66 + i * 44; const a = col(s.from), b = col(s.to);
        return <g key={i}>{s.from === s.to ? <path d={`M${a} ${y - 8} h38 v16 h-36`} fill="none" stroke="rgb(var(--c-text-secondary))" strokeWidth={1.5} markerEnd="url(#seq-a)" /> : <line x1={a} y1={y} x2={b + (b > a ? -3 : 3)} y2={y} stroke="rgb(var(--c-text-secondary))" strokeWidth={1.5} markerEnd="url(#seq-a)" />}
          <text x={s.from === s.to ? a + 46 : (a + b) / 2} y={y - 7} textAnchor={s.from === s.to ? "start" : "middle"} fontSize={12} fontFamily="monospace" fill="rgb(var(--c-text-primary))">{s.type}</text>{s.note && <text x={s.from === s.to ? a + 46 : (a + b) / 2} y={y + 15} textAnchor={s.from === s.to ? "start" : "middle"} fontSize={11} fill="rgb(var(--c-text-tertiary))">{s.note}</text>}</g>; })}
    </svg>
  );
}
function Exchanges() {
  return <div className="space-y-5">{EXCHANGES.map((x) => <Card key={x.id}><CardHeader title={x.title} subtitle={x.summary} /><CardBody><Sequence x={x} /></CardBody></Card>)}</div>;
}

function Validate() {
  const [type, setType] = useState("relay.task.create"); const [text, setText] = useState(() => pretty(exampleEnvelope("relay.task.create")));
  const [out, setOut] = useState<{ ok: boolean; lines: string[] } | null>(null); const [sig, setSig] = useState("");
  const parsed = () => { try { return { v: JSON.parse(text) as Record<string, unknown> }; } catch (e) { return { err: e instanceof Error ? e.message : "Not valid JSON" }; } };
  const check = () => { const p = parsed(); if (p.err) return setOut({ ok: false, lines: [`The text is not valid JSON: ${p.err}`] }); const issues = validateEnvelope(p.v); setOut({ ok: issues.length === 0, lines: issues.map((i) => `${i.path || "envelope"}: ${i.message}`) }); };
  const sign = async () => { const p = parsed(); if (!p.v) return setSig("Fix the JSON first."); if (!signingAvailable()) return setSig("This browser cannot sign."); const k = await generateSigningKey(); if (!k) return setSig("A key could not be made."); const signed = await signEnvelope(p.v, k.privateKey); const ok = await verifyEnvelope(signed, k.publicKey); const tampered = await verifyEnvelope({ ...signed, id: "msg_tampered" }, k.publicKey); setText(pretty(signed)); setSig(`Signed with a throwaway key. Verifies: ${ok ? "yes" : "no"}. After changing one field it verifies: ${tampered ? "yes (unexpected)" : "no, as it should"}.`); };
  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
      <Card><CardHeader title="Envelope" subtitle="Paste a message or start from an example." action={<select aria-label="Example message" value={type} onChange={(e) => { setType(e.target.value); setText(pretty(exampleEnvelope(e.target.value))); setOut(null); setSig(""); }} className="h-8 rounded-md border border-border-strong bg-surface px-2 text-[13px]">{MESSAGE_TYPES.map((t) => <option key={t}>{t}</option>)}</select>} />
        <CardBody className="space-y-3"><textarea aria-label="Envelope JSON" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} rows={22} className="w-full rounded-md border border-border-strong bg-surface p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-accent-500/40" />
          <div className="flex gap-2"><Button variant="primary" onClick={check}>Check message</Button><Button variant="secondary" onClick={sign}>Sign and verify</Button></div></CardBody></Card>
      <div className="space-y-4">
        {out && <Notice tone={out.ok ? "ok" : "bad"} title={out.ok ? "This message is valid" : `${out.lines.length} ${out.lines.length === 1 ? "problem" : "problems"}`}>{out.ok ? "Every required field is present, ids and times are well formed, and the payload matches its type." : <ul className="list-disc pl-4 space-y-1">{out.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}</Notice>}
        {sig && <Notice tone="info" title="Signature">{sig}</Notice>}
        {!out && !sig && <p className="text-sm text-text-secondary">Checking runs here in your browser. Nothing is sent anywhere.</p>}
      </div>
    </div>
  );
}

function Errors() {
  const tone = { yes: "healthy", no: "down", later: "degraded", maybe: "info" } as const;
  return (
    <Card><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-text-tertiary border-b border-border"><th className="px-5 py-2.5 font-medium">Code</th><th className="px-3 font-medium">Meaning</th><th className="px-3 font-medium">Retry</th></tr></thead>
      <tbody className="divide-y divide-border">{ERROR_CODES.map((e) => <tr key={e.code}><td className="px-5 py-2.5 font-mono text-[13px]">{e.code}</td><td className="px-3 text-text-secondary">{e.meaning}</td><td className="px-3"><Badge tone={tone[e.retryable]}>{e.retryable === "yes" ? "Yes" : e.retryable === "no" ? "No" : e.retryable === "later" ? "Later" : "Maybe"}</Badge></td></tr>)}</tbody></table></div></Card>
  );
}
