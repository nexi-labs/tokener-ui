"use client";

import clsx from "clsx";
import { Cpu, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Input, Segmented } from "@/components/ui/Form";
import { Kpi, Notice, Tabs } from "@/components/mlops/ui";
import { SAMPLE_PROMPTS } from "@/lib/optimize/samples";
import { MODE_STAGES, STAGES, lineDiff, optimize, type Mode, type StageId } from "@/lib/optimize/stages";
import { approxCounter, exactCounter } from "@/lib/optimize/tec/tokens";
import type { Counter } from "@/lib/optimize/tec/types";

const MODES: { value: Exclude<Mode, "off">; label: string }[] = [
  { value: "lossless", label: "Lossless" },
  { value: "balanced", label: "Balanced" },
  { value: "aggressive", label: "Aggressive" },
];
const MODE_NOTE = {
  lossless: "Reads the structure, rejoins broken lines, keeps one copy of repeats and writes tables in the cheapest form. Nothing the model could use is removed.",
  balanced: "Adds removal of page and web furniture, repeated phrases defined once, and fitting to the question with a 70% token budget. Numbers, identifiers and links go last, and any that are cut are listed.",
  aggressive: "Same steps with a 45% token budget. Use for drafting and exploration, not for records.",
} as const;
const RISK_TONE = { lossless: "healthy", structural: "info", lossy: "degraded" } as const;
const RISK_LABEL = { lossless: "Lossless", structural: "Structural, checked", lossy: "Lossy, guarded" } as const;
const TOKENIZERS = [
  { id: "approx", label: "Built-in estimate" },
  { id: "o200k_base", label: "o200k (GPT-4o and later)" },
  { id: "cl100k_base", label: "cl100k (GPT-4, GPT-3.5)" },
] as const;

const TEXT_EXT = ["txt", "md", "csv", "tsv", "json", "xml", "yaml", "yml", "html", "htm", "eml", "log"];
const fmt = (n: number) => n.toLocaleString("en-US");

export function Inspector() {
  const [sample, setSample] = useState(SAMPLE_PROMPTS[0].id);
  const first = SAMPLE_PROMPTS[0];
  const [text, setText] = useState(first.text);
  const [question, setQuestion] = useState(first.question);
  const [mode, setMode] = useState<Exclude<Mode, "off">>("lossless");
  const [on, setOn] = useState<StageId[]>(MODE_STAGES.lossless);
  const [price, setPrice] = useState("3.00");
  const [view, setView] = useState<"output" | "diff">("output");
  const [tok, setTok] = useState<(typeof TOKENIZERS)[number]["id"]>("approx");
  const [counter, setCounter] = useState<Counter>(approxCounter);
  const [tokState, setTokState] = useState<"ready" | "loading" | "failed">("ready");
  const [fileNote, setFileNote] = useState<{ tone: "info" | "warn"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async (f: File | undefined) => {
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!TEXT_EXT.includes(ext)) { setFileNote({ tone: "warn", text: `${f.name} is a ${ext.toUpperCase() || "binary"} file. PDF, Word, Excel, PowerPoint, images and audio are read by the document worker on the server, so they cannot be opened in the browser. Text, Markdown, CSV, JSON, XML, HTML, email and log files work here.` }); return; }
    if (f.size > 1_000_000) { setFileNote({ tone: "warn", text: `${f.name} is larger than 1 MB. Paste the part you want to test.` }); return; }
    setText(await f.text()); setSample(""); setFileNote({ tone: "info", text: `Loaded ${f.name}. The file stays in your browser and is not uploaded.` });
  };

  const pick = (id: string) => { setFileNote(null); const s = SAMPLE_PROMPTS.find((x) => x.id === id)!; setSample(id); setText(s.text); setQuestion(s.question); };
  const chooseMode = (m: Exclude<Mode, "off">) => { setMode(m); setOn(MODE_STAGES[m]); };
  const toggle = (id: StageId) => setOn((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  useEffect(() => {
    if (tok === "approx") { setCounter(approxCounter); setTokState("ready"); return; }
    let live = true; setTokState("loading");
    exactCounter(tok).then((c) => { if (live) { setCounter(c); setTokState("ready"); } }).catch(() => { if (live) { setTok("approx"); setTokState("failed"); } });
    return () => { live = false; };
  }, [tok]);

  const run = useMemo(() => optimize(text, question, mode, on, undefined, counter), [text, question, mode, on, counter]);
  const saved = run.before - run.after, pct = run.before ? (saved / run.before) * 100 : 0;
  const p = Number(price) || 0;
  const per1k = (p / 1_000_000) * saved * 1000;
  const diff = useMemo(() => (view === "diff" ? lineDiff(text, run.output) : []), [view, text, run.output]);
  const lossy = on.includes("pack") || on.includes("noise") || on.includes("alias");

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary max-w-3xl">Paste a prompt, or pick an example, and see what the gateway would send to the model. These stages run here on your text, so you can check what each one removes before turning it on for an application. Every table is written in several forms and the one that costs the fewest tokens for the chosen tokenizer wins. Choose a real tokenizer to measure with it instead of the built-in estimate.</p>

      <div className="grid xl:grid-cols-5 gap-5">
        <div className="xl:col-span-3 space-y-4">
          <Card>
            <CardHeader title="Input" action={
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" className="sr-only" aria-label="Load a file" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />
                <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 h-8 rounded-md border border-border-strong bg-surface px-2.5 text-xs hover:bg-surface-subtle"><Upload size={13} /> Load a file</button>
                <select aria-label="Example" value={sample} onChange={(e) => pick(e.target.value)} className="h-8 rounded-md border border-border-strong bg-surface px-2 text-xs">
                  {!sample && <option value="">Your file</option>}
                  {SAMPLE_PROMPTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>} />
            <CardBody className="space-y-3">
              <textarea aria-label="Prompt text" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
                className="w-full h-64 resize-y rounded-md border border-border-strong bg-surface p-3 font-mono text-xs leading-5 focus:outline-none focus:ring-2 focus:ring-accent-500/40" />
              <Field label="Question the model will answer" hint="Fitting to a budget uses this to decide what matters. Without it, that step is skipped.">
                <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Optional" />
              </Field>
              {fileNote ? <Notice tone={fileNote.tone}>{fileNote.text}</Notice> : <p className="text-xs text-text-tertiary">{SAMPLE_PROMPTS.find((s) => s.id === sample)?.note}</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Result" action={<Tabs tabs={[{ id: "output", label: "What is sent" }, { id: "diff", label: "Changes" }]} value={view} onChange={setView} />} />
            <CardBody>
              {view === "output" ? (
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-subtle p-3 font-mono text-xs leading-5">{run.output || "Nothing left to send."}</pre>
              ) : (
                <div className="max-h-80 overflow-auto rounded-md border border-border font-mono text-xs leading-5">
                  {diff.map((d, i) => (
                    <div key={i} className={clsx("flex gap-2 px-3 whitespace-pre-wrap break-words", d.kind === "removed" && "bg-status-down/10 text-status-down", d.kind === "added" && "bg-status-healthy/10 text-status-healthy")}>
                      <span aria-hidden className="select-none w-3 shrink-0">{d.kind === "removed" ? "-" : d.kind === "added" ? "+" : " "}</span><span>{d.text || " "}</span>
                    </div>))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="xl:col-span-2 space-y-4">
          <Card>
            <CardHeader title="Fidelity policy" />
            <CardBody className="space-y-3">
              <Segmented value={mode} onChange={chooseMode} options={MODES} />
              <p className="text-xs text-text-secondary">{MODE_NOTE[mode]}</p>
              <ul className="divide-y divide-border">
                {STAGES.map((s) => {
                  const r = run.stages.find((x) => x.id === s.id)!;
                  return (
                    <li key={s.id} className="py-2.5">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" checked={on.includes(s.id)} onChange={() => toggle(s.id)} className="mt-1 h-4 w-4 accent-accent-600" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 flex-wrap"><span className="text-[13px] font-medium">{s.label}</span><Badge tone={RISK_TONE[s.risk]}>{RISK_LABEL[s.risk]}</Badge></span>
                          <span className="block text-xs text-text-tertiary mt-0.5">{s.body}</span>
                          {r.applied && r.changes.map((c) => <span key={c} className="block text-xs text-text-secondary mt-1">{c}</span>)}
                          {r.applied && !r.changes.length && <span className="block text-xs text-text-tertiary mt-1">Nothing to change in this text.</span>}
                          {r.skipped && on.includes(s.id) && <span className="block text-xs text-status-degraded mt-1">{r.skipped}</span>}
                        </span>
                        {r.applied && <span className="text-xs tabular-nums text-text-secondary shrink-0">{r.before - r.after > 0 ? `-${fmt(r.before - r.after)}` : "0"}</span>}
                      </label>
                    </li>);
                })}
              </ul>
            </CardBody>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Tokens before" value={fmt(run.before)} sub={tokState === "loading" ? "Loading tokenizer" : counter.name === "approx-v1" ? "Estimated" : `Counted with ${tok}`} />
            <Kpi label="Tokens after" value={fmt(run.after)} sub={`${pct.toFixed(1)}% fewer`} />
          </div>
          <Field label="Count tokens with" hint={tokState === "failed" ? "The tokenizer could not be loaded, so the estimate is used." : "A real tokenizer is loaded in your browser the first time you choose it."}>
            <select aria-label="Tokenizer" value={tok} onChange={(e) => setTok(e.target.value as typeof tok)} className="h-9 w-full rounded-md border border-border-strong bg-surface px-2 text-sm">
              {TOKENIZERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Field>
          <Card>
            <CardBody className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <Field label="Input price per million tokens (USD)"><Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="w-28" /></Field>
                <div className="text-right"><div className="text-xs text-text-tertiary">Saved per 1,000 requests like this</div><div className="text-lg font-semibold tabular-nums">${per1k.toFixed(2)}</div></div>
              </div>
              <div role="img" aria-label={`${pct.toFixed(0)} percent fewer tokens`} className="h-2 rounded-full bg-surface-muted overflow-hidden"><div className="h-full bg-accent-600" style={{ width: `${Math.max(0, Math.min(100, 100 - pct))}%` }} /></div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Structure found" subtitle="What the reader recognised in the input" />
            <CardBody>
              {Object.keys(run.structure).length ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {Object.entries(run.structure).map(([k, v]) => <div key={k} className="flex justify-between gap-2"><dt className="text-text-secondary capitalize">{k}</dt><dd className="tabular-nums font-medium">{v}</dd></div>)}
                </dl>) : <p className="text-xs text-text-tertiary">Nothing to read yet.</p>}
            </CardBody>
          </Card>

          {run.tables.map((t, i) => (
            <Card key={i}>
              <CardHeader title={`Table ${i + 1}`} subtitle={`${t.rows} rows, ${t.cols} columns. Cheapest form that reads back exactly.`} />
              <CardBody>
                <ul className="space-y-1.5">
                  {t.encoded.candidates.length ? t.encoded.candidates.slice().sort((a, b) => a.tokens - b.tokens).map((c) => {
                    const max = Math.max(...t.encoded.candidates.map((x) => x.tokens));
                    return (
                      <li key={c.id} className="text-xs">
                        <div className="flex items-center justify-between gap-2"><span className={clsx(c.chosen ? "font-medium text-text-primary" : "text-text-secondary")}>{c.label}{c.chosen ? ", chosen" : ""}</span><span className="tabular-nums text-text-secondary">{fmt(c.tokens)}</span></div>
                        <div aria-hidden className="mt-1 h-1.5 rounded-full bg-surface-muted overflow-hidden"><div className={clsx("h-full", c.chosen ? "bg-accent-600" : "bg-border-strong")} style={{ width: `${(c.tokens / max) * 100}%` }} /></div>
                      </li>);
                  }) : <li className="text-xs text-text-tertiary">Encoding is off for this policy, so the table is sent as plain Markdown.</li>}
                </ul>
              </CardBody>
            </Card>))}

          {run.aliases.length > 0 && (
            <Card>
              <CardHeader title="Repeated phrases" subtitle="Defined once, then written as a short marker" />
              <CardBody>
                <ul className="space-y-1 text-xs">
                  {run.aliases.map((a) => <li key={a.marker} className="flex gap-2"><code className="font-mono text-accent-700 shrink-0">{a.marker}</code><span className="text-text-secondary break-words">{a.phrase} <span className="text-text-tertiary">({a.uses} uses)</span></span></li>)}
                </ul>
              </CardBody>
            </Card>)}

          <Card>
            <CardHeader title="Critical details" subtitle="Numbers, identifiers, addresses and links" />
            <CardBody className="space-y-2">
              <div className="flex items-baseline gap-2"><span className="text-lg font-semibold tabular-nums">{run.critical.kept} of {run.critical.total}</span><span className="text-xs text-text-tertiary">still present in what is sent</span></div>
              {run.critical.lost.length > 0 && <Notice tone="warn" title={`${run.critical.lost.length} lost without a reason`}>{run.critical.lost.slice(0, 8).join(", ")}. This should not happen. The request would be sent unconverted.</Notice>}
              {run.critical.cut.length > 0 && <Notice tone="warn" title={`${run.critical.cut.length} cut to fit the question`}>{run.critical.cut.slice(0, 8).join(", ")}{run.critical.cut.length > 8 ? ", ..." : ""}. They were in sentences that did not match the question. Use Lossless if these matter for the task.</Notice>}
              {run.critical.excused.length > 0 && <Notice tone="info" title={`${run.critical.excused.length} removed with page or web furniture`}>{run.critical.excused.slice(0, 8).join(", ")}. They were only in a footer, a signature or a page header.</Notice>}
              {!run.critical.lost.length && !run.critical.cut.length && !run.critical.excused.length && <Notice tone="ok">Every number, identifier, address and link in the input is still present.</Notice>}
              {run.fallbacks.map((f) => <Notice key={f} tone="info">{f}</Notice>)}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="flex items-start gap-3">
                <span className="h-8 w-8 rounded-md bg-surface-muted grid place-items-center shrink-0"><Cpu size={16} /></span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap"><span className="text-[13px] font-medium">Learned compression</span><Badge tone="neutral">Optimizer service required</Badge></div>
                  <p className="text-xs text-text-tertiary mt-1">A small model on a GPU scores each token for the question and drops the ones that carry little. It reaches further than these rules on long documents, so it is lossy, runs in shadow first, and stays off until the optimizer service is deployed and an application opts in.</p>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
