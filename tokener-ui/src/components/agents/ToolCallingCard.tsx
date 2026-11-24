"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { Notice } from "@/components/mlops/ui";
import type { Agent } from "@/lib/agents/types";
import type { HubConnection } from "@/lib/agents/connectors";
import { LIMIT_LABEL, LIMIT_RANGE, SANDBOXES, SANDBOX_BY_ID, defaultCodeMode, estimateTokens, sampleSurface, validateToolCalling, type CodeLimits, type SandboxKind, type ToolCalling, type ToolMode } from "@/lib/agents/codemode";

const MODES: { id: ToolMode; label: string; body: string; best: string }[] = [
  { id: "direct", label: "Direct calls", body: "The model sees every tool definition and asks for one call at a time. Each result goes back through the model.", best: "A few tools, or steps that depend on what the model reads." },
  { id: "code", label: "Code Mode", body: "The model sees a small typed API, writes a short program that makes several calls and combines the results, and only the final answer comes back.", best: "Many tools, long chains of calls, large results to filter or join." },
];
const n = (v: number) => v.toLocaleString("en-US");
const num = (v: string, d = 0) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : d);

/** Direct MCP calls or Code Mode for one agent, with the sandbox, its limits and a plain estimate of what it changes. */
export function ToolCallingCard({ a, value, onChange, lock, connections }: { a: Agent; value: ToolCalling | undefined; onChange: (v: ToolCalling) => void; lock: boolean; connections: HubConnection[] }) {
  const tc: ToolCalling = value ?? { mode: "direct" };
  const code = tc.code ?? defaultCodeMode();
  const [tools, setTools] = useState(Math.max(a.tools.length, 12)); const [steps, setSteps] = useState(6); const [result, setResult] = useState(800); const [defTokens, setDefTokens] = useState(350);
  const cf = connections.filter((c) => c.integrationId.startsWith("cloudflare"));
  const est = useMemo(() => estimateTokens({ tools, defTokens, steps, resultTokens: result }), [tools, defTokens, steps, result]);
  const issues = validateToolCalling(tc, { control: a.control, hasSensitiveTools: a.tools.some((t) => t.sensitive), runtime: a.execution?.runtime, toolCount: a.tools.length });
  const pick = (mode: ToolMode) => onChange(mode === "direct" ? { mode } : { mode, code: tc.code ?? defaultCodeMode() });
  const setCode = (p: Partial<typeof code>) => onChange({ mode: "code", code: { ...code, ...p } });
  const sb = SANDBOX_BY_ID[code.sandbox];
  const surface = useMemo(() => sampleSurface(a.tools.length ? a.tools : [{ server: "orders", tool: "get_order" }, { server: "orders", tool: "list_refunds" }, { server: "tokener-notify", tool: "request_approval" }]), [a.tools]);
  const bar = (v: number, max: number) => ({ width: `${Math.max(3, Math.round((v / max) * 100))}%` });

  return (
    <Card><CardHeader title="How it calls tools" subtitle="One call at a time, or a short program that makes the calls. Either way each call goes through the same policy, approvals and audit." />
      <CardBody className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Tool calling">
          {MODES.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={tc.mode === m.id} disabled={lock} onClick={() => pick(m.id)}
              className={clsx("text-left rounded-lg border p-3 transition-colors disabled:opacity-60", tc.mode === m.id ? "border-[#07191E] bg-surface-subtle ring-1 ring-[#07191E]" : "border-border hover:bg-surface-subtle")}>
              <div className="text-sm font-semibold">{m.label}</div><div className="text-xs text-text-secondary mt-1 leading-snug">{m.body}</div><div className="text-[11px] text-text-tertiary mt-2">Suits: {m.best}</div></button>))}
        </div>

        {tc.mode === "code" && (
          <div className="space-y-5">
            <div>
              <div className="text-sm font-semibold mb-2">Where the program runs</div>
              <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Sandbox">
                {SANDBOXES.map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={code.sandbox === s.id} disabled={lock} onClick={() => setCode({ sandbox: s.id as SandboxKind, connection: s.id === "cloudflare" ? code.connection : undefined })}
                    className={clsx("text-left rounded-lg border p-3 disabled:opacity-60", code.sandbox === s.id ? "border-[#07191E] ring-1 ring-[#07191E]" : "border-border hover:bg-surface-subtle")}>
                    <div className="flex items-center gap-2"><span className="text-sm font-semibold">{s.label}</span><span className="text-[10px] uppercase tracking-wide rounded bg-surface-subtle border border-border px-1.5 py-0.5 text-text-tertiary">{s.status}</span></div>
                    <div className="text-xs text-text-secondary mt-1 leading-snug">{s.blurb}</div>
                    <div className="text-[11px] text-text-tertiary mt-2">{s.runs}</div></button>))}
              </div>
              <p className="text-xs text-text-tertiary mt-2 max-w-3xl">{sb.isolation}. {sb.leaves ? "Data leaves your network while a program runs." : "Data stays in your network."}</p>
              {code.sandbox === "cloudflare" && (
                <div className="mt-3 max-w-md"><Field label="Cloudflare connection" hint={cf.length ? undefined : "No Cloudflare connection yet. Add one in Integrations, under MCP."}>
                  <Select disabled={lock} value={code.connection ?? ""} onChange={(e) => setCode({ connection: e.target.value || undefined })}><option value="">Choose a connection</option>{cf.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field></div>)}
            </div>

            <div>
              <div className="text-sm font-semibold mb-2">Limits for each program</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {(Object.keys(LIMIT_RANGE) as (keyof CodeLimits)[]).map((k) => (
                  <Field key={k} label={LIMIT_LABEL[k].label} hint={`${LIMIT_LABEL[k].unit}. ${LIMIT_LABEL[k].blurb}`}>
                    <Input disabled={lock} type="number" min={LIMIT_RANGE[k][0]} max={LIMIT_RANGE[k][1]} value={code.limits[k]} onChange={(e) => setCode({ limits: { ...code.limits, [k]: num(e.target.value) } })} /></Field>))}
              </div>
              <div className="mt-3 grid sm:grid-cols-2 gap-x-6">
                <Toggle checked={code.reviewCode} onChange={(v) => !lock && setCode({ reviewCode: v })} label="A person reads the program first" description="The run waits for approval before the program starts. Slower, and the safe way to begin." />
                <Toggle checked={code.keepCode} onChange={(v) => !lock && setCode({ keepCode: v })} label="Keep each program with its trace" description="So a run can be replayed and two modes compared in Evals." />
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-5">
              <div>
                <div className="text-sm font-semibold mb-2">What the model is shown</div>
                <pre className="rounded-lg bg-[#07191E] text-[#D7F7EA] text-[12px] leading-relaxed p-4 overflow-x-auto whitespace-pre">{surface}</pre>
                <p className="text-xs text-text-tertiary mt-2">A sample built from this agent&apos;s tools. A call that is not in the list does not exist for the program.</p>
              </div>
              <div>
                <div className="text-sm font-semibold mb-2">Rough size of what the model reads</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tools available"><Input type="number" min={1} value={tools} onChange={(e) => setTools(num(e.target.value, 1))} /></Field>
                  <Field label="Steps in a task"><Input type="number" min={1} value={steps} onChange={(e) => setSteps(num(e.target.value, 1))} /></Field>
                  <Field label="Tokens per tool definition"><Input type="number" min={0} value={defTokens} onChange={(e) => setDefTokens(num(e.target.value))} /></Field>
                  <Field label="Tokens per result"><Input type="number" min={0} value={result} onChange={(e) => setResult(num(e.target.value))} /></Field>
                </div>
                <div className="mt-4 space-y-2 text-xs">
                  <div><div className="flex justify-between"><span>Direct calls</span><span className="tabular-nums">{n(est.direct)} tokens</span></div><div className="h-2 rounded bg-surface-subtle mt-1"><div className="h-2 rounded bg-ink-500" style={bar(est.direct, Math.max(est.direct, est.code))} /></div></div>
                  <div><div className="flex justify-between"><span>Code Mode</span><span className="tabular-nums">{n(est.code)} tokens</span></div><div className="h-2 rounded bg-surface-subtle mt-1"><div className="h-2 rounded bg-accent-600" style={bar(est.code, Math.max(est.direct, est.code))} /></div></div>
                </div>
                <p className="text-xs text-text-tertiary mt-3">{est.saved > 0 ? `About ${est.savedPct}% fewer tokens for these sizes.` : "No saving at these sizes."} This is arithmetic on the numbers above, not a measurement. Run the same eval suite in both modes to see the real figures, including pass rate and latency.</p>
              </div>
            </div>
          </div>
        )}

        {issues.map((i) => <Notice key={i.path + i.message} tone={i.level === "error" ? "bad" : "warn"} title={i.level === "error" ? "Fix before saving" : "Note"}>{i.message}</Notice>)}
      </CardBody></Card>
  );
}
