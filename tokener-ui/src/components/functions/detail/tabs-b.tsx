"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { GuardButton, KeyValue, Kpi, MetricChart, Notice, useRole } from "@/components/mlops/ui";
import { toast } from "@/lib/mlops/toast";
import { ExecBadge, Meter, ModelChip, ProviderChip, TRIGGER_LABEL, TriggerChip, ago, fmtMs, pct, when } from "@/components/functions/ui";
import { buckets, execStats } from "@/lib/functions/select";
import { executionDetail, groupUsage, sumUsage } from "@/lib/functions/ledger";
import { MODELS, PROVIDERS } from "@/lib/functions/catalog";
import { updateGovernance } from "@/lib/functions/store";
import { DATA_CLASSES, compact, num, usd, usd2, type ExecStatus, type FnExecution, type FnFunction, type FunctionsState, type Governance, type LogLine, type TriggerKind } from "@/lib/functions/types";

type P = { s: FunctionsState; f: FnFunction; execs: FnExecution[] };

// ------------------------------------------------------------------------------------------------ execution history

export function HistoryTab({ s, f, execs }: P) {
  const [status, setStatus] = useState<ExecStatus | "all">("all"); const [trig, setTrig] = useState<TriggerKind | "all">("all"); const [limit, setLimit] = useState(25);
  const rows = execs.filter((e) => (status === "all" || e.status === status) && (trig === "all" || e.trigger === trig));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select aria-label="Outcome" value={status} onChange={(e) => { setStatus(e.target.value as ExecStatus | "all"); setLimit(25); }} className="!w-48"><option value="all">Any outcome</option>{(["succeeded", "failed", "timeout", "blocked", "throttled"] as ExecStatus[]).map((x) => <option key={x} value={x}>{x}</option>)}</Select>
        <Select aria-label="Trigger" value={trig} onChange={(e) => { setTrig(e.target.value as TriggerKind | "all"); setLimit(25); }} className="!w-44"><option value="all">Any trigger</option>{(Object.keys(TRIGGER_LABEL) as TriggerKind[]).map((k) => <option key={k} value={k}>{TRIGGER_LABEL[k]}</option>)}</Select>
        <span className="text-xs text-text-tertiary self-center">{num(rows.length)} executions in 7 days</span>
      </div>
      <Card>
        {rows.length === 0 ? <EmptyState icon={ScrollText} title="No executions" description={execs.length === 0 ? "This function has not run yet." : "No execution matches the filters."} /> : (
          <>
            <Table>
              <Thead><tr><Th>Execution</Th><Th>Outcome</Th><Th>Trigger</Th><Th>Rev</Th><Th>Duration</Th><Th>Model</Th><Th>Tokens</Th><Th>Cost</Th><Th>Started</Th></tr></Thead>
              <tbody>
                {rows.slice(0, limit).map((e) => (
                  <Tr key={e.id}>
                    <Td><Link href={`/mlops/functions/executions/${e.id}`} className="font-code text-xs hover:underline">{e.id}</Link>{e.workflowRunId && <div className="text-[11px] text-text-tertiary">in workflow run</div>}</Td>
                    <Td><ExecBadge s={e.status} /></Td><Td><TriggerChip kind={e.trigger} /></Td><Td className="tabular-nums text-text-secondary">r{e.revision}</Td>
                    <Td className="tabular-nums text-text-secondary">{fmtMs(e.durationMs)}{e.coldStart && <span className="text-[11px] text-text-tertiary"> cold</span>}</Td>
                    <Td className="text-text-secondary"><ModelChip id={e.model} /></Td><Td className="tabular-nums text-text-secondary">{e.tokensIn + e.tokensOut ? `${num(e.tokensIn)} / ${num(e.tokensOut)}` : "none"}</Td>
                    <Td className="tabular-nums text-text-secondary">{usd(e.costMicros, 5)}</Td><Td className="text-text-secondary">{ago(e.startedAt, s.anchor)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            {rows.length > limit && <div className="p-3 border-t border-border text-center"><Button onClick={() => setLimit(limit + 50)}>Show 50 more</Button></div>}
          </>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ logs and errors

export function LogsTab({ s, f, execs }: P) {
  const [level, setLevel] = useState<LogLine["level"] | "all">("all"); const [source, setSource] = useState<LogLine["source"] | "all">("all");
  const failing = useMemo(() => execs.filter((e) => e.status !== "succeeded"), [execs]);
  const groups = useMemo(() => {
    const m = new Map<string, { code: string; message: string; n: number; last: string; sample: string }>();
    for (const e of failing) { const k = e.error?.code ?? e.status; const g = m.get(k); if (g) g.n++; else m.set(k, { code: k, message: e.error?.message ?? "", n: 1, last: e.startedAt, sample: e.id }); }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [failing]);
  const lines = useMemo(() => {
    const picks = [...failing.slice(0, 10), ...execs.filter((e) => e.status === "succeeded").slice(0, 4)].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
    return picks.flatMap((e) => executionDetail(e, s).logs.map((l, i) => ({ ...l, id: `${e.id}-${i}`, exec: e })));
  }, [failing, execs, s]);
  const shown = lines.filter((l) => (level === "all" || l.level === level) && (source === "all" || l.source === source));
  const color = { debug: "text-text-tertiary", info: "text-text-secondary", warn: "text-[#9A5F05]", error: "text-status-down" };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Errors, 7 days" subtitle="Grouped by code" />
        {groups.length === 0 ? <p className="px-5 py-6 text-sm text-text-secondary">No errors in the last 7 days.</p> : (
          <Table><Thead><tr><Th>Code</Th><Th>Count</Th><Th>Message</Th><Th>Example</Th></tr></Thead>
            <tbody>{groups.map((g) => <Tr key={g.code}><Td className="font-code text-xs">{g.code}</Td><Td className="tabular-nums">{g.n}</Td><Td className="text-text-secondary">{g.message}</Td><Td><Link href={`/mlops/functions/executions/${g.sample}`} className="font-code text-xs hover:underline">{g.sample}</Link></Td></Tr>)}</tbody></Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Log stream" subtitle="Recent failures first, with a few successful runs for contrast. Payloads are never logged." />
        <div className="px-5 py-3 flex gap-2 border-b border-border">
          <Select aria-label="Level" value={level} onChange={(e) => setLevel(e.target.value as typeof level)} className="!w-36"><option value="all">All levels</option><option value="debug">debug</option><option value="info">info</option><option value="warn">warn</option><option value="error">error</option></Select>
          <Select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="!w-40"><option value="all">All sources</option><option value="platform">platform</option><option value="gateway">gateway</option><option value="function">function</option></Select>
        </div>
        {shown.length === 0 ? <p className="px-5 py-6 text-sm text-text-secondary">No log line matches.</p> : (
          <ul className="font-code text-[12px] divide-y divide-border max-h-[460px] overflow-auto">
            {shown.slice(0, 120).map((l) => (
              <li key={l.id} className="px-5 py-1.5 flex gap-3">
                <span className="text-text-tertiary shrink-0 w-[128px]">{when(l.exec.startedAt).replace(" UTC", "")} +{l.tMs}ms</span>
                <span className={`shrink-0 w-12 ${color[l.level]}`}>{l.level}</span><span className="shrink-0 w-16 text-text-tertiary">{l.source}</span>
                <span className="min-w-0 break-words text-text-primary">{l.message} <Link href={`/mlops/functions/executions/${l.exec.id}`} className="text-text-tertiary hover:underline">{l.exec.id.slice(0, 9)}</Link></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ AI consumption and cost

export function CostTab({ s, f, execs }: P) {
  const usage = s.usage.filter((u) => u.fnId === f.id);
  const sum = sumUsage(usage);
  const byModel = groupUsage(usage, (u) => u.model);
  const byTrigger = (["http", "kafka", "schedule"] as TriggerKind[]).map((k) => { const e = execs.filter((x) => x.trigger === k); return { k, n: e.length, cost: e.reduce((a, x) => a + x.costMicros, 0) }; }).filter((r) => r.n > 0);
  const anchor = new Date(s.anchor).getTime();
  const spentDay = usage.filter((u) => new Date(u.at).getTime() >= anchor - 86_400_000).reduce((a, u) => a + u.costMicros, 0);
  const spentWeek = sum.costMicros;
  const series = buckets(s.anchor, "7d").map((b) => ({ t: b.label, cost: sumUsage(usage.filter((u) => { const t = new Date(u.at).getTime(); return t >= b.start && t < b.end; })).costMicros / 1_000_000 }));
  const top = [...execs].filter((e) => e.costMicros > 0).sort((a, b) => b.costMicros - a.costMicros).slice(0, 5);
  if (!f.governance.allowedModels.length && usage.length === 0) {
    return <Card><EmptyState icon={ScrollText} title="This function makes no model calls" description="It is not allowed any model, so there is no token usage or AI cost to attribute. Allow a model in Governance and policies to change that." /></Card>;
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="AI cost, 7 days" value={usd(sum.costMicros)} sub={`${num(sum.calls)} model calls`} /><Kpi label="Tokens, 7 days" value={compact(sum.tokensIn + sum.tokensOut)} sub={`${compact(sum.tokensIn)} in, ${compact(sum.tokensOut)} out`} />
        <Kpi label="Cost per call" value={usd(sum.calls ? sum.costMicros / sum.calls : 0, 5)} sub={`ceiling ${usd(f.governance.maxCostMicros)}`} /><Kpi label="Tokens per call" value={num(sum.calls ? Math.round((sum.tokensIn + sum.tokensOut) / sum.calls) : 0)} sub={`limit ${num(f.governance.maxInputTokens + f.governance.maxOutputTokens)}`} />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2"><CardHeader title="Cost per day" subtitle="US dollars, UTC" /><div className="p-4"><MetricChart data={series} series={[{ key: "cost", name: "AI cost (USD)" }]} area height={200} /></div></Card>
        <Card>
          <CardHeader title="Budgets" subtitle="Spend against this function's limits" />
          <div className="px-5 py-4 space-y-4 text-[13px]">
            {([["Daily", spentDay, f.governance.dailyBudgetMicros], ["Weekly", spentWeek, f.governance.weeklyBudgetMicros]] as [string, number, number][]).map(([k, v, m]) => (
              <div key={k}><div className="flex justify-between mb-1"><span className="text-text-secondary">{k}</span><span className="tabular-nums">{usd(v)} of {usd(m)} <span className="text-text-tertiary">({pct(v, m, 0)})</span></span></div><Meter value={v} max={m} label={`${k} budget`} /></div>
            ))}
            <p className="text-xs text-text-tertiary">A call that would pass a limit is blocked before it reaches a model.</p>
          </div>
        </Card>
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader title="By model" />
          <Table><Thead><tr><Th>Model</Th><Th>Calls</Th><Th>Tokens in</Th><Th>Tokens out</Th><Th>Cost</Th><Th>Share</Th></tr></Thead>
            <tbody>{byModel.map((r) => <Tr key={r.key}><Td><ModelChip id={r.key} /></Td><Td className="tabular-nums">{num(r.calls)}</Td><Td className="tabular-nums text-text-secondary">{num(r.tokensIn)}</Td><Td className="tabular-nums text-text-secondary">{num(r.tokensOut)}</Td><Td className="tabular-nums">{usd(r.costMicros)}</Td><Td className="tabular-nums text-text-secondary">{pct(r.costMicros, sum.costMicros, 0)}</Td></Tr>)}</tbody></Table>
        </Card>
        <Card>
          <CardHeader title="By trigger" />
          <ul className="divide-y divide-border">{byTrigger.map((r) => <li key={r.k} className="px-5 py-3 text-[13px] flex justify-between"><TriggerChip kind={r.k} /><span className="tabular-nums">{usd(r.cost)} <span className="text-text-tertiary">({num(r.n)})</span></span></li>)}</ul>
          <div className="px-5 py-3 border-t border-border text-xs text-text-tertiary">Costliest calls</div>
          <ul className="divide-y divide-border">{top.map((e) => <li key={e.id} className="px-5 py-2 text-[12px] flex justify-between"><Link href={`/mlops/functions/executions/${e.id}`} className="font-code hover:underline">{e.id}</Link><span className="tabular-nums">{usd(e.costMicros, 5)}</span></li>)}</ul>
        </Card>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ governance and policies

const dollars = (m: number) => String(m / 1_000_000);
const toMicros = (v: string) => Math.round(parseFloat(v || "0") * 1_000_000);

export function GovernanceTab({ s, f, execs }: P) {
  const role = useRole();
  const g0 = f.governance;
  const [g, setG] = useState<Governance>(g0);
  const [cost, setCost] = useState(dollars(g0.maxCostMicros)); const [day, setDay] = useState(dollars(g0.dailyBudgetMicros)); const [week, setWeek] = useState(dollars(g0.weeklyBudgetMicros)); const [appr, setAppr] = useState(g0.approvalAboveMicros === null ? "" : dollars(g0.approvalAboveMicros));
  const [egress, setEgress] = useState(g0.egressAllow.join("\n")); const [ref, setRef] = useState(""); const [err, setErr] = useState<string | null>(null);
  const patch = (p: Partial<Governance>) => setG((x) => ({ ...x, ...p }));
  const toggle = (k: "allowedProviders" | "allowedModels" | "policyIds", id: string) => setG((x) => ({ ...x, [k]: x[k].includes(id) ? x[k].filter((y) => y !== id) : [...x[k], id] }));
  const dirty = JSON.stringify(g) !== JSON.stringify(g0) || cost !== dollars(g0.maxCostMicros) || day !== dollars(g0.dailyBudgetMicros) || week !== dollars(g0.weeklyBudgetMicros) || appr !== (g0.approvalAboveMicros === null ? "" : dollars(g0.approvalAboveMicros)) || egress !== g0.egressAllow.join("\n");
  const external = g.allowedProviders.some((id) => PROVIDERS.find((p) => p.id === id)?.external);

  const save = () => {
    const next: Governance = { ...g, maxCostMicros: toMicros(cost), dailyBudgetMicros: toMicros(day), weeklyBudgetMicros: toMicros(week), approvalAboveMicros: appr === "" ? null : toMicros(appr), egressAllow: g.egress === "none" ? [] : egress.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean) };
    next.allowedModels = next.allowedModels.filter((m) => next.allowedProviders.includes(MODELS.find((x) => x.id === m)!.providerId));
    if (next.weeklyBudgetMicros < next.dailyBudgetMicros) return setErr("The weekly budget must be at least the daily budget.");
    if (next.egress === "allowlist" && next.egressAllow.length === 0) return setErr("Add at least one host, or set network egress to None.");
    if (next.dataClass === "restricted" && next.policyIds.includes("pol-residency") && external) return setErr("Restricted data may not use an external provider while the data residency policy is attached. Choose in-house providers, or detach the policy with an approver.");
    if (external && next.dataClass !== "public" && !next.piiRedaction) return setErr("Turn on personal data redaction before sending non-public data to an external provider.");
    if (next.retries.max > 5) return setErr("Retries are limited to 5.");
    if (next.maxConcurrency > 200 || next.maxConcurrency < 1) return setErr("Concurrency must be between 1 and 200.");
    const r = updateGovernance(f.id, next);
    if (r.ok) { setErr(null); toast("Governance saved (simulated). It applies from the next revision in a real deployment.", "info"); } else setErr(r.error);
  };

  const pol = s.policies.map((p) => { const e = execs.filter((x) => x.policy.policyId === p.id); return { p, deny: e.filter((x) => x.policy.result === "deny").length, attached: g.policyIds.includes(p.id) }; });
  const st = execStats(execs); const dayStart = new Date(s.anchor).getTime() - 86_400_000;
  const spentDay = s.usage.filter((u) => u.fnId === f.id && new Date(u.at).getTime() >= dayStart).reduce((a, u) => a + u.costMicros, 0);
  const health: [string, boolean, string][] = [
    ["Success rate above 95 percent", !st.total || st.ok / st.total >= 0.95, pct(st.ok, st.total)], ["p95 latency under 70 percent of the timeout", st.p95 < f.governance.timeoutS * 700, `${fmtMs(st.p95)} of ${f.governance.timeoutS} s`],
    ["Daily budget under 85 percent", spentDay < f.governance.dailyBudgetMicros * 0.85, `${pct(spentDay, f.governance.dailyBudgetMicros, 0)} used`], ["Throttled calls under 1 percent", st.total === 0 || st.throttled / st.total < 0.01, `${st.throttled} of ${st.total}`],
  ];

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader title="Models and providers" subtitle="The gateway blocks any call outside these lists." />
          <div className="px-5 py-4 grid sm:grid-cols-2 gap-5">
            <fieldset><legend className="text-[13px] font-medium mb-2">Providers</legend>
              {PROVIDERS.map((p) => <label key={p.id} className="flex items-center gap-2 py-1 text-[13px]"><input type="checkbox" checked={g.allowedProviders.includes(p.id)} onChange={() => toggle("allowedProviders", p.id)} /><ProviderChip id={p.id} /><span className="text-xs text-text-tertiary">{p.external ? "external" : "in-house"}</span></label>)}
            </fieldset>
            <fieldset><legend className="text-[13px] font-medium mb-2">Models</legend>
              {MODELS.filter((m) => g.allowedProviders.includes(m.providerId)).map((m) => <label key={m.id} className="flex items-center gap-2 py-1 text-[13px]"><input type="checkbox" checked={g.allowedModels.includes(m.id)} onChange={() => toggle("allowedModels", m.id)} />{m.name}</label>)}
              {g.allowedProviders.length === 0 && <p className="text-xs text-text-tertiary">Allow a provider to choose models. With none, this function cannot call a model.</p>}
            </fieldset>
          </div>
        </Card>
        <Card>
          <CardHeader title="Health" subtitle="From the last 7 days" />
          <ul className="divide-y divide-border">{health.map(([k, v, d]) => <li key={k} className="px-5 py-2.5 text-[13px] flex items-start justify-between gap-3"><span className="text-text-secondary">{k}</span><span className="shrink-0 text-right"><Badge tone={v ? "healthy" : "degraded"}>{v ? "ok" : "check"}</Badge><div className="text-xs text-text-tertiary mt-0.5">{d}</div></span></li>)}</ul>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Limits" subtitle="Hard stops, enforced at the gateway and the runtime" />
          <div className="px-5 py-4 grid sm:grid-cols-2 gap-4">
            <Field label="Max input tokens"><Input type="number" min={0} value={g.maxInputTokens} onChange={(e) => patch({ maxInputTokens: +e.target.value })} /></Field>
            <Field label="Max output tokens"><Input type="number" min={0} value={g.maxOutputTokens} onChange={(e) => patch({ maxOutputTokens: +e.target.value })} /></Field>
            <Field label="Cost ceiling per call (USD)"><Input type="number" min={0} step="0.0001" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
            <Field label="Timeout (seconds)"><Input type="number" min={1} max={900} value={g.timeoutS} onChange={(e) => patch({ timeoutS: +e.target.value })} /></Field>
            <Field label="Daily budget (USD)"><Input type="number" min={0} step="0.01" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
            <Field label="Weekly budget (USD)"><Input type="number" min={0} step="0.01" value={week} onChange={(e) => setWeek(e.target.value)} /></Field>
            <Field label="Invocations per minute"><Input type="number" min={1} value={g.invocationsPerMinute} onChange={(e) => patch({ invocationsPerMinute: +e.target.value })} /></Field>
            <Field label="Invocations per day"><Input type="number" min={1} value={g.dailyInvocationCap} onChange={(e) => patch({ dailyInvocationCap: +e.target.value })} /></Field>
            <Field label="Max concurrency"><Input type="number" min={1} max={200} value={g.maxConcurrency} onChange={(e) => patch({ maxConcurrency: +e.target.value })} /></Field>
            <Field label="Approval needed above (USD)" hint="Leave empty for none."><Input type="number" min={0} step="0.0001" value={appr} onChange={(e) => setAppr(e.target.value)} /></Field>
            <Field label="Retries"><Input type="number" min={0} max={5} value={g.retries.max} onChange={(e) => patch({ retries: { ...g.retries, max: +e.target.value } })} /></Field>
            <Field label="Backoff"><Select value={g.retries.backoff} onChange={(e) => patch({ retries: { ...g.retries, backoff: e.target.value as "fixed" | "exponential" } })}><option value="exponential">Exponential</option><option value="fixed">Fixed</option></Select></Field>
          </div>
        </Card>
        <Card>
          <CardHeader title="Data and network" />
          <div className="px-5 py-4 grid sm:grid-cols-2 gap-4">
            <Field label="Data class"><Select value={g.dataClass} onChange={(e) => patch({ dataClass: e.target.value as Governance["dataClass"] })}>{DATA_CLASSES.map((d) => <option key={d}>{d}</option>)}</Select></Field>
            <Field label="Payload logging"><Select value={g.logPayloads} onChange={(e) => patch({ logPayloads: e.target.value as Governance["logPayloads"] })}><option value="none">None</option><option value="metadata">Metadata only</option><option value="redacted">Redacted</option></Select></Field>
            <div className="sm:col-span-2"><Toggle checked={g.piiRedaction} onChange={(v) => patch({ piiRedaction: v })} label="Redact personal data in prompts" description="Card numbers, IBANs, ids, emails and phones become tokens before leaving the network." /></div>
            <Field label="Network egress"><Select value={g.egress} onChange={(e) => patch({ egress: e.target.value as Governance["egress"] })}><option value="none">None</option><option value="allowlist">Allowlist</option></Select></Field>
            <Field label="Dead-letter topic"><Input value={g.deadLetter ?? ""} onChange={(e) => patch({ deadLetter: e.target.value || null })} placeholder="none" /></Field>
            {g.egress === "allowlist" && <div className="sm:col-span-2"><Field label="Allowed hosts" hint="One per line."><textarea value={egress} onChange={(e) => setEgress(e.target.value)} rows={3} className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-code focus:outline-none focus:ring-2 focus:ring-accent-500/40" /></Field></div>}
            <div className="sm:col-span-2">
              <div className="text-[13px] font-medium mb-1.5">Secret references</div>
              {g.secretRefs.length === 0 && <p className="text-xs text-text-tertiary mb-2">None. Values are never stored here, only references to a secret manager.</p>}
              <ul className="space-y-1 mb-2">{g.secretRefs.map((r) => <li key={r} className="flex items-center justify-between text-xs font-code bg-surface-muted rounded px-2 py-1">{r}<button onClick={() => patch({ secretRefs: g.secretRefs.filter((x) => x !== r) })} className="text-status-down not-italic font-sans">Remove</button></li>)}</ul>
              <div className="flex gap-2"><Input aria-label="Secret reference" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="secretref://vault/team/name" className="font-code text-xs" />
                <Button onClick={() => { if (!/^secretref:\/\/[a-z0-9/_-]+$/i.test(ref)) return setErr("A secret reference looks like secretref://vault/team/name. Paste a reference, never the secret."); patch({ secretRefs: [...new Set([...g.secretRefs, ref])] }); setRef(""); setErr(null); }}>Add</Button></div>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Policies" subtitle="Attached policies run on every invocation, in this order" />
        <Table><Thead><tr><Th>Attached</Th><Th>Policy</Th><Th>Mode</Th><Th>Status</Th><Th>Version</Th><Th>Denials, 7 days</Th></tr></Thead>
          <tbody>{pol.map(({ p, deny, attached }) => (
            <Tr key={p.id}>
              <Td><input type="checkbox" aria-label={`Attach ${p.name}`} checked={attached} disabled={p.status === "draft"} onChange={() => toggle("policyIds", p.id)} /></Td>
              <Td><div className="font-medium">{p.name}</div><div className="text-xs text-text-tertiary max-w-md">{p.description}</div></Td>
              <Td><Badge tone={p.mode === "enforce" ? "healthy" : "neutral"}>{p.mode}</Badge></Td><Td><Badge tone={p.status === "active" ? "healthy" : "neutral"}>{p.status}</Badge></Td>
              <Td className="tabular-nums text-text-secondary">v{p.version}</Td><Td className="tabular-nums">{deny}</Td>
            </Tr>))}</tbody></Table>
      </Card>

      {err && <Notice tone="bad" title="Not saved">{err}</Notice>}
      <div className="sticky bottom-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface shadow-popover px-4 py-3">
        <span className="text-[13px] text-text-secondary">{dirty ? "You have unsaved governance changes." : "Governance is saved."}</span>
        <div className="flex gap-2"><Button disabled={!dirty} onClick={() => { setG(g0); setCost(dollars(g0.maxCostMicros)); setDay(dollars(g0.dailyBudgetMicros)); setWeek(dollars(g0.weeklyBudgetMicros)); setAppr(g0.approvalAboveMicros === null ? "" : dollars(g0.approvalAboveMicros)); setEgress(g0.egressAllow.join("\n")); setErr(null); }}>Discard</Button><GuardButton action="settings.edit" env={f.env} role={role} variant="primary" extraDisabled={dirty ? undefined : "Nothing has changed"} onClick={save}>Save governance</GuardButton></div>
      </div>
    </div>
  );
}

export { KeyValue, usd2 };
