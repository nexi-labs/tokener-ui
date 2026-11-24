/**
 * The audit log client. Live: GET /api/v1/audit (filters and paging) and GET /api/v1/audit/export (CSV, every matching page).
 * Sample: a fixed in-memory log in the sample workspace, filtered the same way. Times go over the wire as ISO date-times.
 */
import { call, http, type Paged } from "@/lib/api/client";

export type AuditEntry = {
  id: string; tenantId: string | null; actorId: string | null; action: string; resourceType: string | null;
  resourceId: string | null; beforeState: string | null; afterState: string | null; occurredAt: string;
};
export type AuditFilter = { tenantId?: string; actorId?: string; action?: string; resourceType?: string; resourceId?: string; from?: string; to?: string };

export interface AuditLog {
  mode: "live" | "sample";
  query(filter: AuditFilter, page: number, size: number): Promise<Paged<AuditEntry>>;
  /** The CSV of every entry matching the tenant and date range, as the server builds it. */
  exportCsv(filter: Pick<AuditFilter, "tenantId" | "from" | "to">): Promise<Blob>;
}

const BASE = "/api/v1/audit";
const clean = (f: AuditFilter) => ({ ...f, actorId: f.actorId?.trim() || undefined, action: f.action?.trim() || undefined, resourceType: f.resourceType?.trim() || undefined, resourceId: f.resourceId?.trim() || undefined });

export const liveAudit: AuditLog = {
  mode: "live",
  query: (filter, page, size) => http.get<Paged<AuditEntry>>(BASE, { ...clean(filter), page, size }),
  exportCsv: async (filter) => (await call<Response>("GET", `${BASE}/export`, undefined, { query: { tenantId: filter.tenantId, from: filter.from, to: filter.to }, raw: true, headers: { Accept: "text/csv" } })).blob(),
};

const T1 = "00000000-0000-4000-8000-0000000000b1";
const T2 = "00000000-0000-4000-8000-0000000000b2";
const at = (h: number) => new Date(Date.UTC(2026, 9, 29, 9, 0) - h * 3_600_000).toISOString();
const row = (n: number, tenantId: string, actorId: string, action: string, resourceType: string, resourceId: string, h: number, beforeState: string | null, afterState: string | null): AuditEntry =>
  ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, tenantId, actorId, action, resourceType, resourceId, beforeState, afterState, occurredAt: at(h) });
const SAMPLE: AuditEntry[] = [
  row(1, T1, "system", "BudgetBreachEvent", "TENANT", T1, 0.3, null, '{"scopeType":"TENANT","action":"THROTTLE","currentSpend":60112,"limit":60000}'),
  row(2, T1, "system", "provider.credential_rotated", "provider", "openai-prod", 5, null, '{"fields":"apiKey"}'),
  row(3, T2, "system", "BudgetBreachEvent", "PROJECT", "p-3", 9, null, '{"scopeType":"PROJECT","action":"BLOCK","currentSpend":20410,"limit":20000}'),
  row(4, T1, "system", "provider.health_changed", "provider", "openai-prod", 30, '{"status":"HEALTHY"}', '{"status":"DEGRADED"}'),
  row(5, T2, "system", "provider.registered", "provider", "bedrock-eu", 52, null, '{"region":"eu-west-1"}'),
];
const inRange = (e: AuditEntry, f: AuditFilter) => (!f.from || Date.parse(e.occurredAt) >= Date.parse(f.from)) && (!f.to || Date.parse(e.occurredAt) <= Date.parse(f.to));
const matches = (e: AuditEntry, f: AuditFilter) => {
  const c = clean(f);
  return (!c.tenantId || e.tenantId === c.tenantId) && (!c.actorId || e.actorId === c.actorId) && (!c.action || e.action === c.action)
    && (!c.resourceType || e.resourceType === c.resourceType) && (!c.resourceId || e.resourceId === c.resourceId) && inRange(e, c);
};
const csv = (v: string | null) => (v == null ? "" : v.includes(",") ? `"${v.replace(/"/g, '""')}"` : v);

export const sampleAudit: AuditLog = {
  mode: "sample",
  query: async (filter, page, size) => {
    const all = SAMPLE.filter((e) => matches(e, filter)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return { content: all.slice(page * size, page * size + size), page, size, totalElements: all.length, totalPages: Math.max(1, Math.ceil(all.length / size)) };
  },
  exportCsv: async (filter) => {
    const lines = ["id,tenant_id,actor_id,action,resource_type,resource_id,occurred_at"];
    for (const e of SAMPLE.filter((x) => (!filter.tenantId || x.tenantId === filter.tenantId) && inRange(x, filter)))
      lines.push([e.id, e.tenantId ?? "", csv(e.actorId), csv(e.action), csv(e.resourceType), csv(e.resourceId), e.occurredAt].join(","));
    return new Blob([lines.join("\n") + "\n"], { type: "text/csv" });
  },
};
