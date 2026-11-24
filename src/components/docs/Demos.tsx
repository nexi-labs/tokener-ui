"use client";

import clsx from "clsx";
import { CheckCircle2, MinusCircle, Play, RefreshCw, Shuffle, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DemoId } from "@/lib/docs/types";
import { gateResults } from "@/lib/crucible/ct";
import { QUERY_EXAMPLES, parseQuery } from "@/lib/crucible/query";
import type { Candidate, CtPolicy, Run } from "@/lib/crucible/types";

/** Every demo runs in the browser on made up numbers. It shows how a rule behaves; it does not touch an organisation. */
function Frame({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="my-8 rounded-xl border border-border bg-surface-subtle p-4 sm:p-5" aria-label={title}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-700">Try it</div>
        <div className="text-[11px] text-text-tertiary border border-dashed border-border-strong rounded px-1.5 py-0.5">Runs in your browser</div>
      </div>
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      <p className="text-[13px] text-text-secondary mt-1 mb-4 max-w-[68ch]">{note}</p>
      {children}
    </section>
  );
}
const btn = "h-9 px-3 rounded-md border border-border-strong bg-surface text-sm hover:bg-surface-muted inline-flex items-center gap-1.5";
const chip = (on: boolean) => clsx("h-8 px-2.5 rounded-full text-[13px] border", on ? "bg-ink-800 text-text-inverse border-ink-800" : "bg-surface text-text-secondary border-border-strong hover:bg-surface-muted");

export function Demo({ id }: { id: DemoId }) {
  switch (id) {
    case "request-path": return <RequestPath />;
    case "budget-breach": return <BudgetBreach />;
    case "policy-tester": return <PolicyTester />;
    case "promotion-gates": return <PromotionGates />;
    case "run-filter": return <RunFilter />;
  }
}

// ---------------------------------------------------------------------------------------------------------------- request path

type Out = "pass" | "changed" | "blocked" | "skipped" | "failover";
type Stage = { id: string; label: string };
const STAGES: Stage[] = [{ id: "auth", label: "Check the key" }, { id: "policy", label: "Evaluate policies" }, { id: "budget", label: "Check budget and quota" }, { id: "route", label: "Choose a provider" }, { id: "ledger", label: "Write the ledger" }];
type Scenario = { id: string; label: string; prompt: string; steps: Record<string, [Out, string]> };
const SCENARIOS: Scenario[] = [
  { id: "ok", label: "A normal request", prompt: "Summarise this support thread in three bullet points.", steps: {
    auth: ["pass", "The key belongs to the support-assistant application in tenant prod."], policy: ["pass", "No rule matched. The default is allow."], budget: ["pass", "Spend is at 41 percent of the monthly budget."],
    route: ["pass", "Alias chat-default points to the first target, which is healthy."], ledger: ["pass", "Accounting event written: 412 prompt tokens, 188 completion tokens."] } },
  { id: "model", label: "Asks for a preview model", prompt: "model: gpt-5-preview, \"Summarise this thread.\"", steps: {
    auth: ["pass", "The key is valid."], policy: ["blocked", "The rule DENY MODEL *-preview matched. A deny overrides every allow, so the request is refused with a 403 that names the policy."], budget: ["skipped", "Not reached."],
    route: ["skipped", "Not reached. Nothing was sent to a provider."], ledger: ["pass", "The refusal is still written, with the policy that decided."] } },
  { id: "budget", label: "Over budget", prompt: "Draft a long report.", steps: {
    auth: ["pass", "The key is valid."], policy: ["pass", "No rule matched."], budget: ["blocked", "The budget for this project has reached its limit and its action is Block. The call stops here with a 429 Budget Exceeded."],
    route: ["skipped", "Not reached. No provider was called, so nothing was spent."], ledger: ["pass", "A blocked event is still written so the refusal appears in Audit."] } },
  { id: "degraded", label: "First provider is degraded", prompt: "Classify this ticket.", steps: {
    auth: ["pass", "The key is valid."], policy: ["pass", "No rule matched."], budget: ["pass", "Within budget."],
    route: ["failover", "The first target is degraded. The gateway moves to the second target in the alias and the answer is returned without an error."], ledger: ["pass", "The event records both attempts and which provider answered."] } },
  { id: "image", label: "Asks for an image", prompt: "POST /v1/images/generations, \"A logo for a coffee shop\"", steps: {
    auth: ["pass", "The key is valid."], policy: ["blocked", "The rule DENY IMAGE matched, so the capability is refused with a 403."], budget: ["skipped", "Not reached."],
    route: ["skipped", "Not reached."], ledger: ["pass", "A refused event is written with the rule that decided."] } },
];
const OUT_ICON: Record<Out, React.ReactNode> = {
  pass: <CheckCircle2 size={16} className="text-status-healthy" />, changed: <RefreshCw size={16} className="text-status-info" />, blocked: <XCircle size={16} className="text-status-down" />,
  skipped: <MinusCircle size={16} className="text-text-tertiary" />, failover: <Shuffle size={16} className="text-status-degraded" />,
};
const OUT_LABEL: Record<Out, string> = { pass: "Passed", changed: "Changed", blocked: "Stopped", skipped: "Not reached", failover: "Failed over" };

function RequestPath() {
  const [sid, setSid] = useState(SCENARIOS[0].id); const [at, setAt] = useState(-1); const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sc = SCENARIOS.find((s) => s.id === sid)!;
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const run = () => {
    if (timer.current) clearTimeout(timer.current);
    setAt(0);
    const tick = (i: number) => { if (i >= STAGES.length) return; setAt(i); timer.current = setTimeout(() => tick(i + 1), 650); };
    tick(0);
  };
  const pick = (id: string) => { if (timer.current) clearTimeout(timer.current); setSid(id); setAt(-1); };
  return (
    <Frame title="Follow a request through the gateway" note="Pick a request and send it. Each stage shows what the gateway decides and why. The stages and their order are the real ones; the policies and numbers are examples.">
      <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Choose a request">{SCENARIOS.map((s) => <button key={s.id} type="button" onClick={() => pick(s.id)} aria-pressed={s.id === sid} className={chip(s.id === sid)}>{s.label}</button>)}</div>
      <div className="rounded-lg border border-border bg-surface px-3 py-2.5 font-code text-[13px] text-text-primary mb-3 break-words">{sc.prompt}</div>
      <button type="button" onClick={run} className="h-9 px-3.5 rounded-md bg-accent-500 text-ink-900 text-sm font-semibold hover:bg-accent-300 inline-flex items-center gap-1.5 mb-4"><Play size={14} />Send the request</button>
      <ol className="list-none m-0 p-0 space-y-2" aria-live="polite">
        {STAGES.map((s, i) => {
          const [out, why] = sc.steps[s.id]; const shown = at >= i; const stopped = STAGES.slice(0, i).some((p) => sc.steps[p.id][0] === "blocked") && out !== "pass";
          return (
            <li key={s.id} className={clsx("rounded-lg border px-3 py-2.5 transition-opacity", shown ? "border-border-strong bg-surface opacity-100" : "border-border bg-surface opacity-50")}>
              <div className="flex items-center gap-2.5">
                <span className="text-[11px] font-mono text-text-tertiary w-4">{i + 1}</span>
                <span className="text-sm font-medium text-text-primary flex-1">{s.label}</span>
                {shown ? <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">{OUT_ICON[out]}{OUT_LABEL[out]}</span> : <span className="text-xs text-text-tertiary">Waiting</span>}
              </div>
              {shown && <p className={clsx("text-[13px] leading-relaxed mt-1.5 ml-[26px]", stopped ? "text-text-tertiary" : "text-text-secondary")}>{why}</p>}
            </li>
          );
        })}
      </ol>
    </Frame>
  );
}

// ---------------------------------------------------------------------------------------------------------------- budget breach

type Action = "NONE" | "WARN" | "THROTTLE" | "BLOCK";
function BudgetBreach() {
  const [limit, setLimit] = useState(60000); const [spend, setSpend] = useState(88); const [action, setAction] = useState<Action>("BLOCK"); const [roll, setRoll] = useState(false); const [carry, setCarry] = useState(10);
  const effective = limit * (1 + (roll ? carry / 100 : 0)); const used = (limit * spend) / 100; const reached = used >= effective;
  const MSG: Record<Action, [string, string]> = {
    NONE: ["No action", "The limit is recorded but nothing changes for callers when it is reached."],
    WARN: ["Warns only", "Requests still pass. A budget warning event is sent to the notification service."],
    THROTTLE: ["Throttles requests", "Requests still pass but at a lower rate, until the period resets or the budget is raised. Callers see slower answers, not errors."],
    BLOCK: ["Blocks requests", "New requests are refused with a 429 Budget Exceeded before they reach a provider, so nothing more is spent."],
  };
  const tone = !reached ? "bg-status-healthy" : action === "BLOCK" ? "bg-status-down" : action === "THROTTLE" ? "bg-[#D86A15]" : action === "WARN" ? "bg-status-degraded" : "bg-text-tertiary";
  return (
    <Frame title="See what happens when a budget is reached" note="A budget has one limit and one action that applies when the limit is reached. Move the spend past the limit and change the action to see the effect. A limit is checked per scope; when several scopes apply, the most restrictive action wins.">
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <label className="text-sm text-text-secondary block">Limit for the period <span className="font-medium text-text-primary tabular-nums">${limit.toLocaleString("en-US")}</span>
          <input type="range" min={5000} max={200000} step={5000} value={limit} onChange={(e) => setLimit(+e.target.value)} className="w-full accent-[#00B876] mt-1" /></label>
        <label className="text-sm text-text-secondary block">Spend so far <span className="font-medium text-text-primary tabular-nums">{spend}% (${Math.round(used).toLocaleString("en-US")})</span>
          <input type="range" min={0} max={130} value={spend} onChange={(e) => setSpend(+e.target.value)} className="w-full accent-[#00B876] mt-1" /></label>
      </div>
      <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="When the limit is reached">{(["NONE", "WARN", "THROTTLE", "BLOCK"] as Action[]).map((a) => <button key={a} type="button" aria-pressed={a === action} onClick={() => setAction(a)} className={chip(a === action)}>{MSG[a][0]}</button>)}</div>
      <label className="flex items-center gap-2 text-sm text-text-secondary mb-3"><input type="checkbox" checked={roll} onChange={(e) => setRoll(e.target.checked)} className="accent-[#00B876]" /> Roll unused budget into the next period (this period received {carry}% from the last)
        {roll && <input type="range" min={0} max={50} value={carry} onChange={(e) => setCarry(+e.target.value)} className="w-28 accent-[#00B876]" aria-label="Carried over percent" />}</label>
      <div className="relative h-4 rounded-full bg-surface-muted border border-border overflow-hidden" role="img" aria-label={`Spend is ${spend} percent of the limit`}>
        <div className={clsx("absolute inset-y-0 left-0 transition-all", tone)} style={{ width: `${Math.min(100, (used / (limit * 1.3)) * 100)}%` }} />
        <div className="absolute inset-y-0 w-px bg-ink-800/70" style={{ left: `${Math.min(100, (effective / (limit * 1.3)) * 100)}%` }} />
      </div>
      <div className="text-[11px] text-text-tertiary mt-1 tabular-nums">Limit reached at ${Math.round(effective).toLocaleString("en-US")}{roll ? " (with carry over)" : ""}</div>
      <div className="rounded-lg border border-border bg-surface px-3.5 py-3 mt-3">
        <div className="text-sm font-semibold text-text-primary flex items-center gap-2"><span className={clsx("h-2.5 w-2.5 rounded-full", tone)} />{reached ? MSG[action][0] : "Within the limit"}</div>
        <p className="text-[13px] text-text-secondary mt-1 leading-relaxed">{reached ? MSG[action][1] : "Requests pass and nothing is sent to anyone."}</p>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------------------------------------------------- policy tester

const DSL = `POLICY "default-prod-policy" SCOPE tenant:prod
  ALLOW MODEL gpt-5, claude-sonnet-5, gemini-2-5-pro
  DENY MODEL *-preview
  LIMIT TOKENS 100000 PER user PER day
  ALLOW HOURS 08:00-18:00 TIMEZONE "Asia/Bahrain"
  DENY IMAGE
  ON BREACH THROTTLE`;
const ALLOWED = ["gpt-5", "claude-sonnet-5", "gemini-2-5-pro"];
const MODELS = ["gpt-5", "claude-sonnet-5", "gemini-2-5-pro", "gpt-5-preview", "llama-3-70b"];

type Verdict = { kind: "allow" | "deny" | "throttle"; rule: string; why: string };
/** The same order the policy engine uses: a deny wins over every allow, then the allow lists and hours, then limits act on breach. */
function decide(model: string, capability: string, hour: number, tokens: number): Verdict {
  if (/-preview$/.test(model)) return { kind: "deny", rule: "DENY MODEL *-preview", why: "An explicit deny always wins over an allow." };
  if (capability === "image") return { kind: "deny", rule: "DENY IMAGE", why: "Image generation is denied for this scope." };
  if (!ALLOWED.includes(model)) return { kind: "deny", rule: "ALLOW MODEL ...", why: `${model} is not in the allow list, so it is refused.` };
  if (hour < 8 || hour >= 18) return { kind: "deny", rule: "ALLOW HOURS 08:00-18:00", why: "The request arrives outside the allowed hours." };
  if (tokens > 100000) return { kind: "throttle", rule: "LIMIT TOKENS 100000 PER user PER day", why: "The user is over the daily token limit, and ON BREACH THROTTLE slows the request instead of refusing it." };
  return { kind: "allow", rule: "ALLOW MODEL", why: "The model is on the allow list, inside the hours and under the limit." };
}

function PolicyTester() {
  const [model, setModel] = useState("claude-sonnet-5"); const [cap, setCap] = useState("chat"); const [hour, setHour] = useState(10); const [tokens, setTokens] = useState(42000);
  const v = decide(model, cap, hour, tokens);
  const tone = v.kind === "allow" ? "text-status-healthy" : v.kind === "throttle" ? "text-status-degraded" : "text-status-down";
  return (
    <Frame title="Test a request against a policy" note="This is the policy from the Policy Builder, written in its DSL. Change the request and see which rule decides. The order is the real one: a deny wins over every allow, then the allow lists and hours apply, and limits act when they are passed.">
      <pre className="rounded-lg bg-ink-800 text-text-inverse font-code text-[12.5px] leading-relaxed px-4 py-3 overflow-x-auto mb-4">{DSL}</pre>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mb-4">
        <label className="text-sm text-text-secondary block">Model<select value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 w-full h-9 rounded-md border border-border-strong bg-surface px-2 text-sm text-text-primary">{MODELS.map((m) => <option key={m}>{m}</option>)}</select></label>
        <label className="text-sm text-text-secondary block">Capability<select value={cap} onChange={(e) => setCap(e.target.value)} className="mt-1 w-full h-9 rounded-md border border-border-strong bg-surface px-2 text-sm text-text-primary"><option value="chat">chat</option><option value="image">image</option></select></label>
        <label className="text-sm text-text-secondary block">Hour of day (Asia/Bahrain) <span className="font-medium text-text-primary tabular-nums">{String(hour).padStart(2, "0")}:00</span><input type="range" min={0} max={23} value={hour} onChange={(e) => setHour(+e.target.value)} className="w-full accent-[#00B876] mt-1" /></label>
        <label className="text-sm text-text-secondary block">Tokens this user used today <span className="font-medium text-text-primary tabular-nums">{tokens.toLocaleString("en-US")}</span><input type="range" min={0} max={200000} step={2000} value={tokens} onChange={(e) => setTokens(+e.target.value)} className="w-full accent-[#00B876] mt-1" /></label>
      </div>
      <div className="rounded-lg border border-border bg-surface px-3.5 py-3">
        <div className={clsx("text-sm font-semibold", tone)}>{v.kind === "allow" ? "Allowed" : v.kind === "throttle" ? "Allowed, but throttled" : "Refused with a 403"}</div>
        <div className="font-code text-[12.5px] text-text-primary mt-1">{v.rule}</div>
        <p className="text-[13px] text-text-secondary mt-1 leading-relaxed">{v.why}</p>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------------------------------------------------- promotion gates

const POLICY = { id: "demo", gates: { metric: "f1_macro", floor: 0.9, noSliceRegression: true, maxFairnessGap: 0.04, maxMemoryGb: 16, maxP95Ms: 80 }, champion: { version: 7, metric: 0.912 } } as unknown as CtPolicy;

function PromotionGates() {
  const [metric, setMetric] = useState(0.921); const [slice, setSlice] = useState(-0.002); const [gap, setGap] = useState(0.021); const [mem, setMem] = useState(11.5); const [p95, setP95] = useState(62);
  const cand: Candidate = { metric, sliceDeltas: [{ slice: "billing", delta: 0.004 }, { slice: "returns", delta: slice }], fairnessGap: gap, peakMemGb: mem, p95Ms: p95 };
  const res = gateResults(POLICY, cand); const all = res.every((r) => r.passed);
  const row = (label: string, v: number, set: (n: number) => void, min: number, max: number, step: number, fmt: (n: number) => string) => (
    <label className="text-sm text-text-secondary block">{label} <span className="font-medium text-text-primary tabular-nums">{fmt(v)}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(+e.target.value)} className="w-full accent-[#00B876] mt-1" /></label>
  );
  return (
    <Frame title="Decide whether a candidate model may be promoted" note="A retraining cycle promotes a candidate only if every gate passes. The champion here scores 0.912 on f1_macro. Move the candidate's results and see which gate stops it. This runs the same gate logic the Crucible console uses.">
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mb-4">
        {row("Candidate f1_macro", metric, setMetric, 0.85, 0.95, 0.001, (n) => n.toFixed(3))}
        {row("Worst slice change", slice, setSlice, -0.03, 0.02, 0.001, (n) => (n >= 0 ? "+" : "") + n.toFixed(3))}
        {row("Fairness gap", gap, setGap, 0, 0.08, 0.001, (n) => n.toFixed(3))}
        {row("Serving memory (GB)", mem, setMem, 4, 24, 0.5, (n) => n.toFixed(1))}
        {row("p95 latency (ms)", p95, setP95, 20, 140, 1, (n) => `${n}`)}
      </div>
      <ul className="list-none m-0 p-0 space-y-1.5">
        {res.map((r) => (
          <li key={r.id} className="flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2">
            {r.passed ? <CheckCircle2 size={16} className="text-status-healthy mt-0.5 shrink-0" /> : <XCircle size={16} className="text-status-down mt-0.5 shrink-0" />}
            <div className="min-w-0"><div className="text-sm text-text-primary">{r.label}</div><div className="text-xs text-text-secondary">{r.detail}</div></div>
          </li>
        ))}
      </ul>
      <p className={clsx("mt-3 text-sm font-medium", all ? "text-status-healthy" : "text-status-down")}>{all ? "All gates pass. The cycle moves on to approval and a canary." : "A gate failed. The cycle ends and the champion keeps serving."}</p>
    </Frame>
  );
}

// ---------------------------------------------------------------------------------------------------------------- run filter

const mk = (id: string, name: string, status: string, owner: string, f1: number, vl: number, lr: number, ver: number, trigger?: string): Run =>
  ({ id, name, status, owner, startedAt: "2026-11-02T09:00:00Z", gpuHours: 3.2, costUsd: 11.4, dataset: { name: "support-tickets", version: ver }, code: { commit: "a41f9c2" }, metrics: { f1_macro: f1, val_loss: vl }, params: { lr }, tags: trigger ? { trigger } : {} }) as unknown as Run;
const RUNS: Run[] = [
  mk("run-01", "baseline", "finished", "priya.nair", 0.902, 0.31, 0.0001, 15), mk("run-02", "lower-lr", "finished", "priya.nair", 0.931, 0.24, 0.00002, 16), mk("run-03", "wide-head", "finished", "marcus.lee", 0.927, 0.26, 0.00004, 16),
  mk("run-04", "bad-batch", "failed", "marcus.lee", 0.0, 0.0, 0.001, 16), mk("run-05", "nightly", "finished", "scheduler", 0.936, 0.22, 0.00002, 17, "continuous"), mk("run-06", "warm-start", "finished", "james.doe", 0.915, 0.29, 0.00005, 16),
  mk("run-07", "nightly", "running", "scheduler", 0.0, 0.0, 0.00002, 17, "continuous"), mk("run-08", "label-fix", "finished", "james.doe", 0.94, 0.21, 0.00003, 17),
];

function RunFilter() {
  const [q, setQ] = useState(QUERY_EXAMPLES[0]);
  const parsed = useMemo(() => parseQuery(q), [q]);
  const rows = parsed.ok ? RUNS.filter(parsed.test) : [];
  return (
    <Frame title="Search runs with a filter" note="The same filter syntax MLflow users know. Try the examples, then write your own. Fields are metrics.name, params.name, tags.name, status, owner, dataset_version and a few more. Eight made up runs are searched here.">
      <div className="flex flex-wrap gap-2 mb-3">{QUERY_EXAMPLES.map((e) => <button key={e} type="button" className={chip(q === e)} onClick={() => setQ(e)}>{e.length > 38 ? e.slice(0, 36) + "..." : e}</button>)}</div>
      <input value={q} onChange={(e) => setQ(e.target.value)} spellCheck={false} aria-label="Run filter" className="w-full h-10 rounded-lg border border-border-strong bg-surface px-3 font-code text-[13px] text-text-primary" />
      {!parsed.ok && <p className="text-xs text-status-down mt-2">{parsed.error} <span className="text-text-tertiary">(at character {parsed.at + 1})</span></p>}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface mt-3">
        <table className="w-full text-[13px] border-collapse"><thead><tr className="bg-surface-subtle text-left text-text-primary">{["Run", "Status", "Owner", "f1_macro", "val_loss", "lr", "Data"].map((h) => <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-border text-text-secondary"><td className="px-3 py-2 text-text-primary">{r.name}</td><td className="px-3 py-2">{r.status}</td><td className="px-3 py-2">{r.owner}</td><td className="px-3 py-2 tabular-nums">{r.metrics.f1_macro.toFixed(3)}</td><td className="px-3 py-2 tabular-nums">{r.metrics.val_loss.toFixed(2)}</td><td className="px-3 py-2 tabular-nums">{String(r.params.lr)}</td><td className="px-3 py-2">v{r.dataset.version}</td></tr>)}
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-text-tertiary">{parsed.ok ? "No run matches." : "Fix the filter to see runs."}</td></tr>}</tbody></table>
      </div>
      <p className="text-xs text-text-tertiary mt-2">{parsed.ok ? `${rows.length} of ${RUNS.length} runs match.` : ""}</p>
    </Frame>
  );
}
