"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Pause, Play, RotateCcw, Search, Waypoints } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Kpi, Tabs } from "@/components/mlops/ui";
import { AgentChip, CopyId, useAgentColors } from "@/components/agents/bits";
import { AgentStrip, AgentTrail, ExportMenu, LogTable, SpanInspector, TraceGraph, Waterfall } from "@/components/agents/TraceViews";
import { ServiceGraph } from "@/components/agents/ServiceGraph";
import { MetricsPanel } from "@/components/agents/MetricsPanel";
import { useAgents } from "@/lib/agents/store";
import { hops, percentile, sameCorrelation, searchTraces, serviceGraph, traceEnd, traceparentOf, type TraceQuery } from "@/lib/agents/observe";
import { PROTOCOLS, PROTOCOL_BY_ID } from "@/lib/agents/topology";
import type { Agent, Trace } from "@/lib/agents/types";
import { ago, compact, dur, pct, usd } from "@/lib/agents/format";
import { toast } from "@/lib/mlops/toast";

type View = "traces" | "dependencies" | "metrics";
const WINDOWS: Record<string, number> = { "24h": 86_400_000, "3d": 3 * 86_400_000 };

export default function TracesPage() { return <Suspense fallback={null}><Inner /></Suspense>; }

function Inner() {
  const sp = useSearchParams(); const id = sp.get("trace");
  const { agents, traces } = useAgents(); const colors = useAgentColors();
  const trace = id ? traces.find((t) => t.id === id) : undefined;
  if (id) return trace ? <Detail trace={trace} traces={traces} agents={agents} colors={colors} /> : (
    <div className="max-w-xl py-10"><h2 className="text-lg font-semibold">That trace is not here</h2><p className="text-sm text-text-secondary mt-2">It may have aged out of the retention period, or the id was mistyped.</p><Link href="/agents/traces" className="inline-block mt-4 text-sm underline">Back to traces</Link></div>
  );
  return <List traces={traces} agents={agents} colors={colors} />;
}

// ---------------------------------------------------------------------------------------------------------------------------------------

function List({ traces, agents, colors }: { traces: Trace[]; agents: Agent[]; colors: Record<string, string> }) {
  const router = useRouter(); const sp = useSearchParams();
  const [view, setView] = useState<View>("traces");
  const [q, setQ] = useState(sp.get("q") ?? ""); const [agent, setAgent] = useState(sp.get("agent") ?? ""); const [status, setStatus] = useState(""); const [kind, setKind] = useState("");
  const [scope, setScope] = useState(""); const [protocol, setProtocol] = useState(""); const [minMs, setMinMs] = useState(""); const [win, setWin] = useState("3d"); const [limit, setLimit] = useState(25);
  const [picked, setPicked] = useState<string | null>(null);
  const query: TraceQuery = { text: q, agent: agent || undefined, status: (status || undefined) as TraceQuery["status"], kind: (kind || undefined) as TraceQuery["kind"], multiAgent: scope === "multi" || undefined, protocol: (protocol || undefined) as TraceQuery["protocol"], minMs: minMs ? Number(minMs) : undefined, sinceMs: WINDOWS[win] };
  const found = useMemo(() => searchTraces(traces, query, agents), [traces, q, agent, status, kind, scope, protocol, minMs, win, agents]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = picked ? found.filter((t) => t.agentIds.includes(picked)) : found;
  const k = useMemo(() => {
    const d = shown.map((t) => t.durationMs);
    return { n: shown.length, failed: shown.filter((t) => t.status === "error").length, multi: shown.filter((t) => t.agentIds.length > 1).length, p95: percentile(d, 95), cost: shown.reduce((x, t) => x + t.costUsd, 0) };
  }, [shown]);
  const maxD = Math.max(1, ...shown.map((t) => t.durationMs));
  const measured = agents.filter((a) => a.control !== "inventory" && a.state !== "retired");
  const ctl = "h-9 text-[13px]";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="max-w-xl"><h2 className="text-lg font-semibold">Traces</h2><p className="text-sm text-text-secondary mt-1">Every run, across every agent that took part. A trace follows one request through the agents it reached, with one id carried on each hand-off, so the whole path can be read in one place.</p></div>
        <div className="ml-auto"><ExportMenu traces={shown.slice(0, 200)} agents={agents} label={`Export ${Math.min(200, shown.length)}`} /></div>
      </div>
      <Tabs label="Trace views" value={view} onChange={setView} tabs={[{ id: "traces", label: "Traces", count: found.length }, { id: "dependencies", label: "Dependencies" }, { id: "metrics", label: "Metrics" }]} />

      {view !== "metrics" && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input aria-label="Search traces" placeholder="Trace id, correlation id, session, agent or step" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-80 rounded-md border border-border bg-surface pl-8 pr-3 text-[13px]" /></div>
          <Select aria-label="Agent" className={`${ctl} !w-56`} value={agent} onChange={(e) => { setAgent(e.target.value); setPicked(null); }}><option value="">All agents</option>{measured.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</Select>
          <Select aria-label="Status" className={`${ctl} !w-40`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="ok">OK</option><option value="error">Failed</option></Select>
          <Select aria-label="Kind" className={`${ctl} !w-56`} value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Runs and evaluations</option><option value="run">Runs</option><option value="eval">Evaluations</option></Select>
          <Select aria-label="Reach" className={`${ctl} !w-52`} value={scope} onChange={(e) => setScope(e.target.value)}><option value="">One or more agents</option><option value="multi">Crosses agents</option></Select>
          <Select aria-label="Protocol" className={`${ctl} !w-44`} value={protocol} onChange={(e) => setProtocol(e.target.value)}><option value="">Any protocol</option>{PROTOCOLS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>
          <Select aria-label="Slower than" className={`${ctl} !w-44`} value={minMs} onChange={(e) => setMinMs(e.target.value)}><option value="">Any duration</option><option value="2000">Over 2 s</option><option value="5000">Over 5 s</option><option value="10000">Over 10 s</option></Select>
          <Select aria-label="Time window" className={`${ctl} !w-40`} value={win} onChange={(e) => setWin(e.target.value)}><option value="24h">Last 24 h</option><option value="3d">Last 3 days</option></Select>
        </div>
      )}

      {view === "traces" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi label="Traces" value={compact(k.n)} sub={picked ? `Through ${agents.find((a) => a.id === picked)?.title}` : "Matching the filters"} />
            <Kpi label="Cross agents" value={k.n ? pct(k.multi / k.n, 0) : "n/a"} sub={`${k.multi} traces reached more than one agent`} />
            <Kpi label="Failed" value={k.n ? pct(k.failed / k.n) : "n/a"} sub={`${k.failed} traces`} tone={k.n && k.failed / k.n > 0.1 ? "warn" : undefined} />
            <Kpi label="Slowest 5%" value={k.n ? dur(k.p95) : "n/a"} sub="95th percentile, end to end" />
            <Kpi label="Cost" value={usd(k.cost, 2)} sub="Of these traces" />
          </div>
          <Card>
            <Table>
              <Thead><tr><Th>Started</Th><Th>Trace</Th><Th>Agents</Th><Th>Hand-offs</Th><Th className="text-right">Spans</Th><Th>Duration</Th><Th className="text-right">Cost</Th><Th>Status</Th></tr></Thead>
              <tbody>
                {shown.slice(0, limit).map((t) => {
                  const root = agents.find((a) => a.id === t.agentId); const h = hops(t); const protos = [...new Set(h.map((x) => x.protocol))];
                  return (
                    <Tr key={t.id} className="cursor-pointer hover:bg-surface-subtle" onClick={() => router.push(`/agents/traces?trace=${t.id}`)}>
                      <Td className="whitespace-nowrap text-text-secondary text-[13px]">{ago(t.startedAt)}</Td>
                      <Td>
                        <div className="flex items-center gap-2"><Link href={`/agents/traces?trace=${t.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{root?.title ?? t.agentId}</Link>{t.kind === "eval" && <Badge tone="info">Evaluation</Badge>}</div>
                        <div className="text-xs text-text-tertiary flex items-center gap-2 mt-0.5" onClick={(e) => e.stopPropagation()}><CopyId value={t.id} label="trace id" /><span>{t.trigger}</span></div>
                      </Td>
                      <Td><div className="flex items-center gap-2"><AgentTrail trace={t} colors={colors} /><span className="text-xs text-text-tertiary tabular-nums">{t.agentIds.length}</span></div></Td>
                      <Td>{protos.length ? <div className="flex gap-1">{protos.map((p) => <span key={p} className="text-[11px] px-1.5 py-0.5 rounded font-medium" style={{ color: PROTOCOL_BY_ID[p].color, background: `${PROTOCOL_BY_ID[p].color}14` }}>{PROTOCOL_BY_ID[p].label}</span>)}</div> : <span className="text-text-tertiary text-xs">None</span>}</Td>
                      <Td className="text-right tabular-nums">{t.spans.length}</Td>
                      <Td><div className="flex items-center gap-2 min-w-[130px]"><div className="h-1.5 flex-1 rounded bg-surface-muted overflow-hidden"><div className="h-full rounded" style={{ width: `${Math.max(3, (t.durationMs / maxD) * 100)}%`, background: t.status === "error" ? "#DC2626" : colors[t.agentId] }} /></div><span className="tabular-nums text-[12.5px] w-14 text-right">{dur(t.durationMs)}</span></div></Td>
                      <Td className="text-right tabular-nums">{usd(t.costUsd, 3)}</Td>
                      <Td>{t.status === "error" ? <Badge tone="down">Failed</Badge> : <Badge tone="healthy">OK</Badge>}</Td>
                    </Tr>
                  );
                })}
                {shown.length === 0 && <Tr><Td colSpan={8} className="text-center text-sm text-text-secondary py-10">No trace matches these filters.</Td></Tr>}
              </tbody>
            </Table>
            {shown.length > limit && <div className="p-3 border-t border-border text-center"><Button onClick={() => setLimit((l) => l + 25)}>Show 25 more ({shown.length - limit} left)</Button></div>}
          </Card>
        </>
      )}

      {view === "dependencies" && (
        <div className="space-y-5">
          <p className="text-sm text-text-secondary max-w-3xl">Built from the {found.length} traces that match. Click an agent to see only its neighbours, then open the list to read its traces.</p>
          <ServiceGraph traces={found} agents={agents} colors={colors} selected={picked} onPick={setPicked} />
          <Card>
            <CardHeader title="Hand-offs" subtitle="Each pair of agents and the protocol between them" />
            <Table>
              <Thead><tr><Th>From</Th><Th>To</Th><Th>Protocol</Th><Th className="text-right">Calls</Th><Th className="text-right">Failed</Th><Th className="text-right">p95</Th></tr></Thead>
              <tbody>
                {serviceGraph(found).edges.map((e, i) => (
                  <Tr key={i}><Td><AgentChip name={agents.find((a) => a.id === e.from)?.name ?? e.from} color={colors[e.from]} /></Td><Td><AgentChip name={agents.find((a) => a.id === e.to)?.name ?? e.to} color={colors[e.to]} /></Td>
                    <Td><span className="text-[12px] font-medium" style={{ color: PROTOCOL_BY_ID[e.protocol].color }}>{PROTOCOL_BY_ID[e.protocol].label}</span></Td><Td className="text-right tabular-nums">{e.calls}</Td><Td className="text-right tabular-nums">{e.errors || "None"}</Td><Td className="text-right tabular-nums">{dur(e.p95Ms)}</Td></Tr>
                ))}
              </tbody>
            </Table>
          </Card>
          {picked && <div className="flex items-center gap-3"><Button onClick={() => setView("traces")}>Open the {shown.length} traces through {agents.find((a) => a.id === picked)?.title}</Button></div>}
        </div>
      )}

      {view === "metrics" && (
        <div className="space-y-5">
          <div className="flex items-center gap-2"><label className="text-[13px] text-text-secondary" htmlFor="m-agent">Show</label>
            <Select id="m-agent" className="h-9 !w-56 text-[13px]" value={agent} onChange={(e) => setAgent(e.target.value)}><option value="">All agents together</option>{measured.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</Select></div>
          <MetricsPanel agents={agents} agent={agents.find((a) => a.id === agent) ?? null} traces={traces} colors={colors} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------

type DView = "waterfall" | "graph" | "logs" | "correlated";

function usePlayhead(total: number) {
  const [t, setT] = useState<number | null>(null); const [playing, setPlaying] = useState(false);
  const raf = useRef<number | null>(null); const last = useRef(0);
  const rate = total / Math.max(3000, Math.min(8000, total));
  useEffect(() => {
    if (!playing) return;
    const tick = (now: number) => {
      const dt = now - (last.current || now); last.current = now;
      setT((p) => { const n = (p ?? 0) + dt * rate; if (n >= total) { setPlaying(false); return total; } return n; });
      raf.current = requestAnimationFrame(tick);
    };
    last.current = 0; raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [playing, rate, total]);
  return { t, playing, play: () => { if (t === null || t >= total) setT(0); setPlaying(true); }, pause: () => setPlaying(false), seek: (n: number) => { setPlaying(false); setT(n); }, stop: () => { setPlaying(false); setT(null); } };
}

function Detail({ trace, traces, agents, colors }: { trace: Trace; traces: Trace[]; agents: Agent[]; colors: Record<string, string> }) {
  const router = useRouter();
  const [view, setView] = useState<DView>("waterfall"); const [sel, setSel] = useState<string | null>(null); const [focus, setFocus] = useState<string | null>(null); const [flow, setFlow] = useState(false);
  const total = traceEnd(trace); const pl = usePlayhead(total);
  useEffect(() => { setSel(null); setFocus(null); pl.stop(); }, [trace.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const span = sel ? trace.spans.find((s) => s.id === sel) ?? null : null;
  const root = agents.find((a) => a.id === trace.agentId);
  const related = useMemo(() => sameCorrelation(traces, trace.correlationId), [traces, trace.correlationId]);
  const protos = [...new Set(hops(trace).map((h) => h.protocol))];
  return (
    <div className="space-y-5">
      <Link href="/agents/traces" className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-text-primary"><ArrowLeft size={14} /> All traces</Link>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap"><h2 className="text-lg font-semibold">{root?.title ?? trace.agentId}</h2>{trace.status === "error" ? <Badge tone="down">Failed</Badge> : <Badge tone="healthy">OK</Badge>}{trace.kind === "eval" && <Badge tone="info">Evaluation</Badge>}</div>
          <p className="text-sm text-text-secondary mt-1">{trace.trigger}, for {trace.behalfOf}, {new Date(trace.startedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium" })}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/agents/constellation?trace=${trace.id}`}><Button><Waypoints size={14} /> Play on Constellation</Button></Link>
          <ExportMenu traces={[trace]} agents={agents} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-3 rounded-lg border border-border bg-surface px-5 py-4 text-[13px]">
        <div><div className="text-xs text-text-tertiary mb-0.5">Trace ID</div><CopyId value={trace.id} label="trace id" full /></div>
        <div><div className="text-xs text-text-tertiary mb-0.5">Correlation ID</div><div className="flex items-center gap-2"><CopyId value={trace.correlationId} label="correlation id" full />{related.length > 1 && <button className="text-xs text-status-info hover:underline whitespace-nowrap" onClick={() => setView("correlated")}>{related.length} traces</button>}</div></div>
        <div><div className="text-xs text-text-tertiary mb-0.5">Session</div><CopyId value={trace.session} label="session" full /></div>
        <div><div className="text-xs text-text-tertiary mb-0.5">traceparent (sent on every hand-off)</div><CopyId value={traceparentOf(trace)} label="traceparent" /></div>
        <div><div className="text-xs text-text-tertiary mb-0.5">Duration</div><span className="tabular-nums">{dur(trace.durationMs)}</span></div>
        <div><div className="text-xs text-text-tertiary mb-0.5">Reach</div>{trace.agentIds.length} agent{trace.agentIds.length > 1 ? "s" : ""}, {trace.spans.length} spans, {trace.depth} deep</div>
        <div><div className="text-xs text-text-tertiary mb-0.5">Cost</div><span className="tabular-nums">{usd(trace.costUsd, 4)}</span>, {trace.tokens.toLocaleString("en-US")} tokens</div>
        <div><div className="text-xs text-text-tertiary mb-0.5">Protocols</div>{protos.length ? protos.map((p) => <span key={p} className="mr-2 font-medium" style={{ color: PROTOCOL_BY_ID[p].color }}>{PROTOCOL_BY_ID[p].label}</span>) : "None, one agent"}</div>
      </div>

      <AgentStrip trace={trace} agents={agents} colors={colors} focus={focus} onFocus={setFocus} />

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[320px]"><Tabs label="Trace views" value={view} onChange={setView} tabs={[{ id: "waterfall", label: "Timeline" }, { id: "graph", label: "Hand-off graph" }, { id: "logs", label: "Logs" }, { id: "correlated", label: "Correlated", count: related.length }]} /></div>
        {(view === "waterfall" || view === "graph") && (
          <div className="flex items-center gap-2 pb-1.5">
            <Button onClick={() => (pl.playing ? pl.pause() : pl.play())} aria-label={pl.playing ? "Pause replay" : "Replay the trace"}>{pl.playing ? <Pause size={14} /> : <Play size={14} />} {pl.playing ? "Pause" : "Replay"}</Button>
            <input type="range" aria-label="Position in the trace" min={0} max={Math.round(total)} value={Math.round(pl.t ?? 0)} onChange={(e) => pl.seek(Number(e.target.value))} className="w-44 accent-[#07191E]" />
            <span className="text-xs text-text-tertiary tabular-nums w-16">{pl.t === null ? dur(total) : dur(pl.t)}</span>
            {pl.t !== null && <button aria-label="Clear replay" className="text-text-tertiary hover:text-text-primary" onClick={pl.stop}><RotateCcw size={14} /></button>}
            {view === "graph" && <label className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary ml-2"><input type="checkbox" className="accent-[#07191E]" checked={flow} onChange={(e) => setFlow(e.target.checked)} /> Show flow</label>}
          </div>
        )}
      </div>

      {(view === "waterfall" || view === "graph") && (
        <div className={span ? "grid xl:grid-cols-[1fr_360px] gap-5 items-start" : ""}>
          <div className="min-w-0">
            {view === "waterfall" ? <Waterfall trace={trace} agents={agents} colors={colors} selected={sel} onSelect={setSel} playhead={pl.t} focus={focus} /> : <TraceGraph trace={trace} agents={agents} colors={colors} playhead={pl.t} selected={sel} onSelect={setSel} animate={flow} />}
            <p className="text-xs text-text-tertiary mt-2">{view === "waterfall" ? "A bar takes the colour of the agent doing the work. Where a line drops to another colour, the work was handed to that agent. Click a step for its ids, attributes and logs." : "Each box is one run of an agent. A line changes colour from the sender to the receiver. Dashed means nobody waited for the answer."}</p>
          </div>
          {span && <Card><CardBody><SpanInspector trace={trace} span={span} agents={agents} colors={colors} onOpenAgent={(id) => router.push(`/agents/registry/${id}`)} /></CardBody></Card>}
        </div>
      )}
      {view === "logs" && <LogTable trace={trace} agents={agents} colors={colors} onSelectSpan={(id) => { setSel(id); setView("waterfall"); }} />}
      {view === "correlated" && (
        <Card>
          <CardHeader title="Traces with this correlation id" subtitle={related.length > 1 ? "A retry, a workflow run or an evaluation shares one id with the traces it is made of." : "This trace stands alone."} />
          <Table>
            <Thead><tr><Th>Started</Th><Th>Agents</Th><Th>Duration</Th><Th>Status</Th><Th /></tr></Thead>
            <tbody>
              {related.map((t) => (
                <Tr key={t.id} className={t.id === trace.id ? "bg-surface-muted" : ""}>
                  <Td className="text-[13px]">{new Date(t.startedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium" })}{t.spans[0]?.attrs?.["retry.attempt"] ? <span className="ml-2 text-xs text-text-tertiary">retry {String(t.spans[0].attrs["retry.attempt"])}</span> : null}</Td>
                  <Td><AgentTrail trace={t} colors={colors} /></Td><Td className="tabular-nums">{dur(t.durationMs)}</Td><Td>{t.status === "error" ? <Badge tone="down">Failed</Badge> : <Badge tone="healthy">OK</Badge>}</Td>
                  <Td className="text-right">{t.id === trace.id ? <span className="text-xs text-text-tertiary">This trace</span> : <Link className="text-[13px] underline" href={`/agents/traces?trace=${t.id}`}>Open</Link>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
