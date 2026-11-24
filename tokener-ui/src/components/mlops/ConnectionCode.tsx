"use client";

import clsx from "clsx";
import { Play } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { codeFor, previewScope, type CodeInput } from "@/lib/mlops/connection-codegen";
import { exampleTransport, planAction, runAction, runDiscover, runObserve, runTest, type Scope } from "@/lib/mlops/contract";
import { CodeBlock } from "./Code";
import { Notice, Tabs } from "./ui";

/**
 * The code for a connection, shown beside the connector the way people expect: the configuration, the calls that create and test it, one
 * tab per language, and for a contract connector the exact requests the platform sends. Everything can be copied. Nothing here holds a secret.
 */
export function ConnectionCode({ input, compact }: { input: CodeInput; compact?: boolean }) {
  const tabs = useMemo(() => codeFor(input), [input]);
  const [tab, setTab] = useState(tabs[0]?.id ?? "config");
  const [file, setFile] = useState(0);
  const cur = tabs.find((t) => t.id === tab) ?? tabs[0];
  const f = cur.files[Math.min(file, cur.files.length - 1)];
  return (
    <div className="space-y-3">
      <Tabs label="Code" value={cur.id} onChange={(v) => { setTab(v); setFile(0); }} tabs={tabs.map((t) => ({ id: t.id, label: t.label }))} />
      {cur.note && <p className="text-xs text-text-secondary">{cur.note}</p>}
      {cur.files.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Files">
          {cur.files.map((x, i) => (
            <button key={x.title} role="tab" aria-selected={i === file} onClick={() => setFile(i)}
              className={clsx("h-7 px-2.5 rounded-md border text-xs", i === file ? "border-accent-600 bg-accent-600/10 text-text-primary" : "border-border-strong text-text-secondary hover:text-text-primary")}>{x.title}</button>
          ))}
        </div>
      )}
      <CodeBlock code={f.code} language={f.language} title={f.title} maxHeight={compact ? 260 : 380} />
      {input.integration.contract && <TryIt input={input} />}
    </div>
  );
}

type Pick = { id: string; label: string; run: (scope: Scope) => Promise<{ ok: boolean; summary: string; detail: unknown; requests: string[] }> };

/** Runs a call of the contract against the examples written in it, so the shape of the request, the answer and the result can be seen before anything is connected. */
export function TryIt({ input }: { input: CodeInput }) {
  const c = input.integration.contract!;
  const [pick, setPick] = useState("test");
  const [out, setOut] = useState<Awaited<ReturnType<Pick["run"]>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useState<Record<string, string>>({});

  const picks: Pick[] = useMemo(() => {
    const show = (r: { method: string; url: string }) => `${r.method} ${r.url}`;
    const list: Pick[] = [{ id: "test", label: "Connection test", run: async (scope) => { const r = await runTest(c, scope, exampleTransport(c, scope), { full: true, readWrite: input.permissions === "read-write" }); return { ok: r.ok, summary: r.ok ? `All ${r.checks.length} checks passed${r.version ? `, version ${r.version}` : ""}.` : `Failed with ${r.failure}.`, detail: r.checks.map((x) => ({ check: x.name, ok: x.ok, detail: x.detail })), requests: r.checks.map((x) => show(x.request)) }; } }];
    for (const d of c.discover ?? []) list.push({ id: `discover:${d.kind}`, label: `Discover ${d.kind}`, run: async (scope) => { const r = await runDiscover(c, scope, d.kind, exampleTransport(c, scope)); return { ok: r.ok, summary: r.ok ? `${r.items.length} found.` : r.detail ?? "Failed.", detail: r.items, requests: r.request ? [show(r.request)] : [] }; } });
    for (const [name, a] of Object.entries(c.actions ?? {})) list.push({ id: `action:${name}`, label: `${name}${a.mode === "write" ? " (plan only)" : ""}`, run: async (scope) => {
      const plan = planAction(c, name, scope);
      if ("error" in plan) return { ok: false, summary: plan.error, detail: null, requests: [] };
      if (a.mode === "write") return { ok: true, summary: "A write action is always planned first. This is the plan. Nothing was changed.", detail: plan, requests: [] };
      const r = await runAction(c, name, scope, exampleTransport(c, scope));
      return { ok: r.ok, summary: r.ok ? "Done." : `Failed with ${r.failure}.`, detail: r.result, requests: r.steps.flatMap((s) => (s.request ? [show(s.request)] : [])) };
    } });
    if (c.observe) list.push({ id: "observe", label: "Observe", run: async (scope) => { const r = await runObserve(c, scope, exampleTransport(c, scope)); return { ok: r.state === "ready", summary: `State: ${r.state}.`, detail: r.attributes, requests: [] }; } });
    return list;
  }, [c, input.permissions]);

  const cur = picks.find((p) => p.id === pick) ?? picks[0];
  const act = cur.id.startsWith("action:") ? c.actions?.[cur.id.slice(7)] : undefined;
  const run = async () => {
    setBusy(true);
    const scope = previewScope(input, Object.fromEntries((act?.params ?? []).map((p) => [p.name, p.type === "number" ? Number(params[p.name] ?? p.default ?? 0) : params[p.name] ?? p.default ?? ""])));
    try { setOut(await cur.run(scope)); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-md border border-border p-3 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-text-secondary">
          <span className="block mb-1 font-medium text-text-primary">Try a call</span>
          <select value={cur.id} onChange={(e) => { setPick(e.target.value); setOut(null); }} className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm min-w-[220px]">
            {picks.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        {(act?.params ?? []).map((p) => (
          <label key={p.name} className="text-xs text-text-secondary">
            <span className="block mb-1">{p.name}</span>
            <input value={params[p.name] ?? String(p.default ?? "")} onChange={(e) => setParams({ ...params, [p.name]: e.target.value })} className="h-9 w-32 rounded-md border border-border-strong bg-surface px-2 text-sm" />
          </label>
        ))}
        <Button variant="secondary" onClick={run} disabled={busy}><Play size={14} /> {busy ? "Running" : "Run"}</Button>
      </div>
      {out ? (
        <div className="space-y-2">
          <Notice tone={out.ok ? "ok" : "bad"}>{out.summary}</Notice>
          {out.requests.length > 0 && <CodeBlock title="Requests sent" language="text" code={out.requests.join("\n")} maxHeight={140} />}
          {out.detail != null && <CodeBlock title="Result" language="json" code={JSON.stringify(out.detail, null, 2)} maxHeight={220} />}
        </div>
      ) : <p className="text-xs text-text-tertiary">Runs the call against the example answers written in the connector, so you can see the requests, the result and any plan before anything is connected. Calls to your real system are made by the control plane or your agent.</p>}
    </div>
  );
}
