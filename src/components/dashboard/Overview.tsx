"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, ArrowRight, Anvil, Bot, BrainCircuit, Database, Gauge, ShieldCheck, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SpendSparkline } from "@/components/dashboard/SpendSparkline";
import { SimpleIcon } from "@/components/icons/SimpleIcon";
import { siAmazon, siAnthropic, siGooglegemini, siOpenai } from "simple-icons";
import { totals, useAgents } from "@/lib/agents/store";
import { isOpen } from "@/lib/agents/approvals";
import { healthOf } from "@/lib/agents/topology";
import { assess, memberCounts } from "@/lib/agents/network";
import { useMlops } from "@/lib/mlops/store";

/** The period's spend and its parts. Every breakdown below adds up to the same figure, so the page agrees with itself. */
const SPEND = 11408; const BUDGET = 15000; const LAST = 10742;
const BY_PRODUCT = [
  { name: "Gateway model calls", value: 7240, color: "#02F5A1" },
  { name: "Agent runs", value: 2650, color: "#2563EB" },
  { name: "Crucible GPU time", value: 960, color: "#F59E0B" },
  { name: "Refinery", value: 358, color: "#8B5CF6" },
  { name: "Storage and other", value: 200, color: "#9AA3AE" },
];
const TOP_MODELS = [
  { model: "claude-sonnet-5", spend: 4820, requests: "520K" },
  { model: "gpt-5", spend: 3905, requests: "390K" },
  { model: "gemini-2-5-pro", spend: 1610, requests: "180K" },
  { model: "llama-3-70b (self-hosted)", spend: 0, requests: "205K" },
  { model: "Other models", spend: 1073, requests: "140K" },
];
const TOP_TENANTS = [{ tenant: "prod", spend: 6110, trend: "up" as const }, { tenant: "recsys-eu", spend: 3880, trend: "up" as const }, { tenant: "staging", spend: 1418, trend: "down" as const }];
const PROVIDERS = [
  { name: "OpenAI", icon: siOpenai, status: "healthy" as const, p99: "412ms" }, { name: "Anthropic", icon: siAnthropic, status: "healthy" as const, p99: "388ms" },
  { name: "Gemini", icon: siGooglegemini, status: "degraded" as const, p99: "1.2s" }, { name: "Bedrock", icon: siAmazon, status: "healthy" as const, p99: "455ms" },
];
const usd = (n: number) => "$" + n.toLocaleString("en-US");
const int = (n: number) => n.toLocaleString("en-US");

type Metric = { label: string; value: string; delta?: string; good?: boolean };
function Tile({ title, href, icon: Icon, metrics, note }: { title: string; href: string; icon: LucideIcon; metrics: Metric[]; note?: React.ReactNode }) {
  return (
    <Link href={href} className="group rounded-lg border border-border bg-surface p-4 hover:border-border-strong hover:shadow-card transition flex flex-col gap-3">
      <div className="flex items-center gap-2.5"><span className="h-8 w-8 rounded-md grid place-items-center bg-surface-muted"><Icon size={16} /></span><span className="text-sm font-semibold">{title}</span><ArrowRight size={14} className="ml-auto text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" /></div>
      <div className="grid grid-cols-3 gap-2">
        {metrics.map((m) => (
          <div key={m.label} className="min-w-0"><div className="text-lg font-semibold tabular-nums leading-tight truncate">{m.value}</div><div className="text-[11px] text-text-tertiary truncate">{m.label}</div>
            {m.delta && <div className={clsx("text-[11px] tabular-nums", m.good ? "text-status-healthy" : "text-status-down")}>{m.delta}</div>}</div>))}
      </div>
      {note && <div className="text-xs text-text-secondary border-t border-border pt-2.5">{note}</div>}
    </Link>
  );
}

export function Overview() {
  const { agents, networks, approvals } = useAgents(); const mlops = useMlops();
  const live = useMemo(() => agents.filter((a) => a.state !== "retired"), [agents]);
  const ag = useMemo(() => {
    const counts = memberCounts(Object.fromEntries(agents.map((a) => [a.id, a.network])));
    const postures = live.map((a) => ({ a, p: assess(a, a.network, networks, counts) }));
    const runsToday = live.reduce((s, a) => s + (a.daily[a.daily.length - 1]?.executions ?? 0), 0);
    const week = live.reduce((s, a) => { const t = totals(a, 7); return { runs: s.runs + t.executions, failed: s.failed + t.failures }; }, { runs: 0, failed: 0 });
    return {
      runsToday, failRate: week.runs ? week.failed / week.runs : 0, governed: live.filter((a) => a.control === "governed").length, waiting: approvals.filter(isOpen).length,
      secured: postures.filter((x) => x.p.configured).length, weak: postures.filter((x) => x.p.configured && (x.p.grade === "D" || x.p.grade === "E")), failing: live.filter((a) => a.state === "active" && healthOf(a) === "failing"),
    };
  }, [agents, networks, approvals, live]);

  const attention: { tone: "down" | "degraded"; text: string; href: string; area: string }[] = [
    ...(ag.waiting ? [{ tone: "degraded" as const, text: `${ag.waiting} ${ag.waiting === 1 ? "run is" : "runs are"} waiting for a person to approve`, href: "/agents/approvals", area: "Agent OS" }] : []),
    ...(ag.weak.length ? [{ tone: "down" as const, text: `${ag.weak.length} ${ag.weak.length === 1 ? "agent is" : "agents are"} weakly protected: ${ag.weak.slice(0, 2).map((x) => x.a.title).join(", ")}`, href: "/agents/networks", area: "Agent networks" }] : []),
    ...(ag.failing.length ? [{ tone: "down" as const, text: `${ag.failing.length} ${ag.failing.length === 1 ? "agent is" : "agents are"} failing: ${ag.failing.slice(0, 2).map((a) => a.title).join(", ")}`, href: "/agents/registry", area: "Agent OS" }] : []),
    { tone: "degraded", text: "Gemini is slow: p99 at 1.2 s, three times its usual", href: "/providers", area: "Providers" },
    { tone: "down", text: "project:recsys runs out of budget in about 9 days at this rate", href: "/budgets", area: "Budgets" },
    { tone: "degraded", text: "tenant:staging has used 91% of its request quota", href: "/quotas", area: "Quotas" },
  ];

  return (
    <div className="space-y-5">
      {/* spend and live */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader title="AI spend" subtitle="This billing period, against budget" />
          <CardBody>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-3xl font-semibold tabular-nums">{usd(SPEND)}</div>
                <div className="flex items-center gap-1.5 mt-1.5 text-sm"><TrendingUp size={14} className="text-status-down" /><span className="text-status-down font-medium">+{(((SPEND - LAST) / LAST) * 100).toFixed(1)}%</span><span className="text-text-tertiary">vs. last period ({usd(LAST)})</span></div>
              </div>
              <div className="text-right"><div className="text-sm text-text-secondary">{Math.round((SPEND / BUDGET) * 100)}% of {usd(BUDGET)} budget</div>
                <div className="w-44 h-1.5 rounded-full bg-surface-muted mt-2 overflow-hidden ml-auto"><div className="h-full bg-accent-500 rounded-full" style={{ width: `${(SPEND / BUDGET) * 100}%` }} /></div>
                <div className="text-xs text-text-tertiary mt-1.5">{usd(BUDGET - SPEND)} left, 9 days to go</div></div>
            </div>
            <SpendSparkline />
            <div className="mt-4">
              <div className="flex h-2 rounded-full overflow-hidden bg-surface-muted" role="img" aria-label="Spend by product">{BY_PRODUCT.map((p) => <div key={p.name} style={{ width: `${(p.value / SPEND) * 100}%`, background: p.color }} title={`${p.name}: ${usd(p.value)}`} />)}</div>
              <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">{BY_PRODUCT.map((p) => <span key={p.name} className="inline-flex items-center gap-1.5 text-xs text-text-secondary"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}<span className="tabular-nums text-text-primary font-medium">{usd(p.value)}</span></span>)}</div>
            </div>
          </CardBody>
        </Card>

        <div className="grid grid-rows-2 gap-5">
          <Card><CardBody className="h-full flex items-center justify-between gap-4"><div><div className="text-xs text-text-tertiary">Live token throughput</div><div className="text-3xl font-semibold tabular-nums mt-1">1,240</div><div className="text-xs text-text-tertiary">tokens / sec</div></div><span className="inline-flex items-center gap-1.5 text-xs text-text-secondary"><span className="h-1.5 w-1.5 rounded-full bg-status-healthy animate-pulse" />Live</span></CardBody></Card>
          <Card><CardBody className="h-full flex items-center justify-between gap-4"><div><div className="text-xs text-text-tertiary">In-flight requests</div><div className="text-3xl font-semibold tabular-nums mt-1">38</div><div className="text-xs text-text-tertiary">across every tenant</div></div><div className="text-right text-xs text-text-secondary"><div>p95 <span className="font-medium text-text-primary tabular-nums">412 ms</span></div><div>errors <span className="font-medium text-text-primary tabular-nums">0.41%</span></div></div></CardBody></Card>
        </div>
      </div>

      {/* attention */}
      <Card>
        <CardHeader title="Needs attention" subtitle="Across every product, most urgent first" />
        <ul className="divide-y divide-border">
          {attention.map((x, i) => (
            <li key={i}><Link href={x.href} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-subtle">
              <AlertTriangle size={15} className={x.tone === "down" ? "text-status-down" : "text-status-degraded"} /><span className="text-sm flex-1">{x.text}</span><span className="text-xs text-text-tertiary hidden sm:block">{x.area}</span><ArrowRight size={14} className="text-text-tertiary" /></Link></li>))}
        </ul>
      </Card>

      {/* products */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Across the platform</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <Tile title="Gateway" href="/usage" icon={Gauge} metrics={[{ label: "Requests", value: "1.98M", delta: "+8.1%", good: true }, { label: "p95 latency", value: "412 ms", delta: "-6%", good: true }, { label: "Cache hits", value: "31%", delta: "+4 pts", good: true }]} note="Spend per request is down 2.3% since the cache rule went live." />
          <Tile title="Agent OS" href="/agents" icon={Bot} metrics={[{ label: "Agents", value: `${live.length}`, }, { label: "Runs today", value: int(ag.runsToday) }, { label: "Failed, 7 days", value: `${(ag.failRate * 100).toFixed(1)}%`, delta: ag.failRate > 0.03 ? "above 3%" : "within target", good: ag.failRate <= 0.03 }]}
            note={<>{ag.governed} governed, {ag.secured} with a network setup{ag.waiting ? `, ${ag.waiting} waiting for approval` : ""}.</>} />
          <Tile title="Governance" href="/policy-studio" icon={ShieldCheck} metrics={[{ label: "Blocked by policy", value: "1,284", delta: "0.06% of calls", good: true }, { label: "PII masked", value: "3,902" }, { label: "Injections stopped", value: "211", delta: "+18%", good: false }]} note="Prompt injection attempts are up, and all of them were stopped." />
          <Tile title="Models and MLOps" href="/mlops" icon={BrainCircuit} metrics={[{ label: "Models", value: int(mlops?.models.length ?? 0) }, { label: "Deployments", value: int(mlops?.deployments.length ?? 0) }, { label: "Pipelines", value: int(mlops?.pipelines.length ?? 0) }]} note={<>{int(mlops?.runs.length ?? 0)} pipeline runs on record, {int(mlops?.knowledge.length ?? 0)} knowledge bases.</>} />
          <Tile title="Crucible" href="/crucible" icon={Anvil} metrics={[{ label: "Runs training", value: "3" }, { label: "Best eval score", value: "0.874", delta: "+0.021", good: true }, { label: "GPU hours", value: "412" }]} note="The latest fine-tune beat its baseline on all four evals." />
          <Tile title="Refinery" href="/refinery" icon={Database} metrics={[{ label: "Datasets", value: "18" }, { label: "Rows refined", value: "42.6M", delta: "+9.4M", good: true }, { label: "PII removed", value: "96.2K" }]} note="Two datasets are waiting for a review before they can be used to train." />
        </div>
      </div>

      {/* breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card>
          <CardHeader title="Top models" subtitle="Ranked by spend" />
          <div className="divide-y divide-border">{TOP_MODELS.map((m) => <div key={m.model} className="flex items-center justify-between px-5 py-3"><span className="text-sm font-mono truncate">{m.model}</span><div className="text-right"><div className="text-sm font-medium tabular-nums">{usd(m.spend)}</div><div className="text-xs text-text-tertiary tabular-nums">{m.requests} req</div></div></div>)}</div>
        </Card>
        <Card>
          <CardHeader title="Top tenants" subtitle="Ranked by spend" />
          <div className="divide-y divide-border">{TOP_TENANTS.map((t) => <div key={t.tenant} className="flex items-center justify-between px-5 py-3"><span className="text-sm">{t.tenant}</span><div className="flex items-center gap-2"><span className="text-sm font-medium tabular-nums">{usd(t.spend)}</span>{t.trend === "up" ? <TrendingUp size={14} className="text-status-down" /> : <TrendingDown size={14} className="text-status-healthy" />}</div></div>)}</div>
        </Card>
        <Card>
          <CardHeader title="Provider health" />
          <div className="divide-y divide-border">{PROVIDERS.map((p) => <div key={p.name} className="flex items-center justify-between px-5 py-3"><div className="flex items-center gap-2.5"><SimpleIcon icon={p.icon} size={16} className="text-text-secondary" /><span className="text-sm">{p.name}</span></div><div className="flex items-center gap-3"><span className="text-xs text-text-tertiary tabular-nums">{p.p99}</span><Badge tone={p.status}>{p.status}</Badge></div></div>)}</div>
        </Card>
      </div>
    </div>
  );
}
