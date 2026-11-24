"use client";

import clsx from "clsx";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Kpi, Loading, Notice } from "@/components/mlops/ui";
import { useMcpServers } from "@/lib/mlops/mcp-servers";
import { PLANS, human, isUnlimited, limitText, pressure, usageRows, type PlanInfo } from "@/lib/mlops/plans";
import { mlops, useMlops } from "@/lib/mlops/store";

const BAR = { ok: "bg-[#02F5A1]", nearly: "bg-[#E8A33D]", full: "bg-[#D6455D]" } as const;
const WORD = { ok: "", nearly: "Nearly full", full: "Full" } as const;

/** What the organisation's plan allows and how much of it is used. The server refuses a create that would pass a limit; this shows the room left before that happens. */
export function PlanPanel() {
  const s = useMlops();
  const servers = useMcpServers();
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    void mlops.getPlan().then((r) => { if (!alive) return; if (r.ok) setPlan(r.plan); else setErr(r.error); });
    return () => { alive = false; };
  }, []);
  const rows = useMemo(() => {
    if (!plan || !s) return [];
    const bytes = s.models.reduce((n, m) => n + m.versions.reduce((k, v) => k + v.sizeMb * 1024 * 1024, 0), 0);
    return usageRows(plan, {
      pipelines: s.pipelines.length, connections: s.connections.length, agents: s.agents.length, deployments: s.deployments.length, models: s.models.length,
      mcpServers: servers?.length ?? 0, storageBytes: bytes, mostVersions: Math.max(0, ...s.models.map((m) => m.versions.length)),
    });
  }, [plan, s, servers]);
  if (err) return <Notice tone="bad" title="The plan could not be read">{err}</Notice>;
  if (!plan || !s) return <Loading />;
  const tight = rows.filter((r) => pressure(r) !== "ok");
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Plan" value={plan.name} sub={plan.description} />
        <Kpi label="Largest single upload" value={limitText(plan.limits.maxUploadBytes, "bytes")} sub="Per model file" />
        <Kpi label="Concurrent runs" value={limitText(plan.limits.maxConcurrentRuns)} sub="At one time" />
        <Kpi label="Pipeline runs a day" value={limitText(plan.limits.maxPipelineRunsPerDay)} sub="Across the organisation" />
      </div>
      {tight.length > 0 && <Notice tone={tight.some((r) => pressure(r) === "full") ? "bad" : "warn"} title={tight.some((r) => pressure(r) === "full") ? "A limit has been reached" : "A limit is close"}>
        {tight.map((r) => `${r.label} (${r.unit === "bytes" ? human(r.used) : r.used} of ${limitText(r.limit, r.unit)})`).join(", ")}. The server refuses a new one at the limit. Remove one you no longer need, or ask a platform administrator to raise the plan.
      </Notice>}
      <Card>
        <CardHeader title="Use against the limits" subtitle="Counted from what this organisation holds now." />
        <CardBody>
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const p = pressure(r); const pct = isUnlimited(r.limit) ? 0 : Math.min(100, Math.round((r.used / Math.max(1, r.limit)) * 100));
              return (
                <li key={r.id} className="py-3 grid grid-cols-[200px_1fr_190px] gap-4 items-center">
                  <span className="text-sm font-medium">{r.label}</span>
                  <div className="h-2 rounded-full bg-surface-subtle overflow-hidden" role="progressbar" aria-label={r.label} aria-valuemin={0} aria-valuemax={isUnlimited(r.limit) ? undefined : r.limit} aria-valuenow={r.used}>
                    <div className={clsx("h-full rounded-full", BAR[p])} style={{ width: `${isUnlimited(r.limit) ? 2 : Math.max(2, pct)}%` }} />
                  </div>
                  <span className="text-sm tabular-nums text-text-secondary text-right">
                    {r.unit === "bytes" ? human(r.used) : r.used} of {limitText(r.limit, r.unit)}{p !== "ok" && <span className="ml-2 text-xs font-medium text-text-primary">{WORD[p]}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Plans" subtitle="A platform administrator gives an organisation a plan. The free plan has no expiry." />
        <CardBody>
          <Table>
            <Thead><tr><Th>Limit</Th>{PLANS.map((p) => <Th key={p.id}>{p.name}{p.id === plan.id && <span className="ml-2"><Badge tone="healthy">Yours</Badge></span>}</Th>)}</tr></Thead>
            <tbody>
              {([["Pipelines", "maxPipelines"], ["Connections", "maxConnections"], ["Build agents", "maxAgents"], ["Deployments", "maxDeployments"], ["Models", "maxModels"], ["Versions per model", "maxVersionsPerModel"], ["MCP servers", "maxMcpServers"], ["Concurrent runs", "maxConcurrentRuns"], ["Runs a day", "maxPipelineRunsPerDay"]] as const).map(([label, k]) => (
                <Tr key={k}><Td>{label}</Td>{PLANS.map((p) => <Td key={p.id} className={clsx("tabular-nums", p.id === plan.id && "font-medium")}>{limitText(p.limits[k])}</Td>)}</Tr>
              ))}
              {([["Largest upload", "maxUploadBytes"], ["Model storage", "maxStorageBytes"]] as const).map(([label, k]) => (
                <Tr key={k}><Td>{label}</Td>{PLANS.map((p) => <Td key={p.id} className={clsx("tabular-nums", p.id === plan.id && "font-medium")}>{limitText(p.limits[k], "bytes")}</Td>)}</Tr>
              ))}
            </tbody>
          </Table>
          <p className="text-xs text-text-tertiary mt-3 inline-flex items-center gap-1.5"><Check size={13} aria-hidden /> Every limit is enforced on the server before anything is created, and a refusal says which limit and how to raise it.</p>
        </CardBody>
      </Card>
    </div>
  );
}
