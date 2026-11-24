/**
 * The plans an organisation can hold, and how much of each limit it uses. The numbers mirror domain/plan/Plans.java; scripts/check-mlops-plans.ts reads that
 * file and fails if the two disagree. The server enforces every limit before it creates anything (403 plan_limit). The console only shows them.
 */
export type PlanLimits = {
  maxPipelines: number; maxConnections: number; maxAgents: number; maxDeployments: number; maxModels: number; maxVersionsPerModel: number;
  maxUploadBytes: number; maxStorageBytes: number; maxConcurrentRuns: number; maxMcpServers: number; maxPipelineRunsPerDay: number;
};
export type PlanInfo = { id: string; name: string; description: string; limits: PlanLimits };

const GIB = 1024 ** 3;
/** The server writes its largest int and long for "no limit". A long that large cannot be held exactly in a browser, so anything past this means no limit. */
export const NO_LIMIT = 2_000_000_000;

export const PLANS: PlanInfo[] = [
  { id: "free", name: "Free", description: "For startups and small teams. Real workloads, no expiry.",
    limits: { maxPipelines: 25, maxConnections: 25, maxAgents: 5, maxDeployments: 10, maxModels: 25, maxVersionsPerModel: 50, maxUploadBytes: 8 * GIB, maxStorageBytes: 100 * GIB, maxConcurrentRuns: 5, maxMcpServers: 5, maxPipelineRunsPerDay: 2000 } },
  { id: "growth", name: "Growth", description: "Raised limits, granted by a platform administrator.",
    limits: { maxPipelines: 100, maxConnections: 100, maxAgents: 25, maxDeployments: 50, maxModels: 100, maxVersionsPerModel: 200, maxUploadBytes: 32 * GIB, maxStorageBytes: 1024 * GIB, maxConcurrentRuns: 20, maxMcpServers: 25, maxPipelineRunsPerDay: 20000 } },
  { id: "unlimited", name: "Unlimited", description: "For installations operated by their owner.",
    limits: { maxPipelines: NO_LIMIT, maxConnections: NO_LIMIT, maxAgents: NO_LIMIT, maxDeployments: NO_LIMIT, maxModels: NO_LIMIT, maxVersionsPerModel: NO_LIMIT, maxUploadBytes: Number.MAX_SAFE_INTEGER, maxStorageBytes: Number.MAX_SAFE_INTEGER, maxConcurrentRuns: NO_LIMIT, maxMcpServers: NO_LIMIT, maxPipelineRunsPerDay: NO_LIMIT } },
];

export const planById = (id: string | undefined): PlanInfo => PLANS.find((p) => p.id === id) ?? PLANS[0];

/** Reads the plan the server sent. A limit the server marks with its largest value means no limit. */
export function toPlan(x: Record<string, any>): PlanInfo {
  const l = (x.limits ?? {}) as Record<string, number>;
  const n = (k: keyof PlanLimits) => (typeof l[k] === "number" ? l[k] : planById("free").limits[k]);
  return {
    id: String(x.id ?? "free"), name: String(x.name ?? "Free"), description: String(x.description ?? ""),
    limits: {
      maxPipelines: n("maxPipelines"), maxConnections: n("maxConnections"), maxAgents: n("maxAgents"), maxDeployments: n("maxDeployments"), maxModels: n("maxModels"),
      maxVersionsPerModel: n("maxVersionsPerModel"), maxUploadBytes: n("maxUploadBytes"), maxStorageBytes: n("maxStorageBytes"), maxConcurrentRuns: n("maxConcurrentRuns"),
      maxMcpServers: n("maxMcpServers"), maxPipelineRunsPerDay: n("maxPipelineRunsPerDay"),
    },
  };
}

export const isUnlimited = (v: number) => v >= NO_LIMIT;

export type UsageRow = { id: string; label: string; used: number; limit: number; unit: "count" | "bytes"; note?: string };
export type UsageInput = { pipelines: number; connections: number; agents: number; deployments: number; models: number; mcpServers: number; storageBytes: number; mostVersions: number };

/** One row per limit the server enforces on a count or on storage. Per file and per day limits are listed separately because the console has no measure of them. */
export function usageRows(plan: PlanInfo, u: UsageInput): UsageRow[] {
  const l = plan.limits;
  return [
    { id: "pipelines", label: "Pipelines", used: u.pipelines, limit: l.maxPipelines, unit: "count" },
    { id: "connections", label: "Connections", used: u.connections, limit: l.maxConnections, unit: "count" },
    { id: "agents", label: "Build agents", used: u.agents, limit: l.maxAgents, unit: "count" },
    { id: "deployments", label: "Deployments", used: u.deployments, limit: l.maxDeployments, unit: "count" },
    { id: "models", label: "Models", used: u.models, limit: l.maxModels, unit: "count" },
    { id: "mcp", label: "MCP servers", used: u.mcpServers, limit: l.maxMcpServers, unit: "count" },
    { id: "versions", label: "Versions in the busiest model", used: u.mostVersions, limit: l.maxVersionsPerModel, unit: "count" },
    { id: "storage", label: "Model storage", used: u.storageBytes, limit: l.maxStorageBytes, unit: "bytes" },
  ];
}

/** "nearly" from 80 percent, "full" at the limit. An unlimited plan is never either. */
export function pressure(r: UsageRow): "ok" | "nearly" | "full" {
  if (isUnlimited(r.limit) || r.limit <= 0) return "ok";
  const p = r.used / r.limit;
  return p >= 1 ? "full" : p >= 0.8 ? "nearly" : "ok";
}

export function human(bytes: number): string {
  if (bytes >= Number.MAX_SAFE_INTEGER / 2) return "No limit";
  if (bytes >= 1024 ** 4) return `${+(bytes / 1024 ** 4).toFixed(1)} TB`;
  if (bytes >= 1024 ** 3) return `${+(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}
export const limitText = (v: number, unit: "count" | "bytes" = "count") => (unit === "bytes" ? human(v) : isUnlimited(v) ? "No limit" : v.toLocaleString("en-US"));
