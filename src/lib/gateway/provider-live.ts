/**
 * Provider registration against the control plane. Used when a person is signed in to a real workspace; the sample workspace keeps its local
 * behaviour. Credentials are sent once, on the way in. Every answer carries references only, so nothing here can hold a secret value after the
 * call returns.
 */
import { http } from "@/lib/api/client";
import type { Health, Provider } from "@/lib/gateway/data";
import { SPECS, type CheckStep, type ProviderSpec, type Registered, type TestOutcome } from "@/lib/gateway/provider-catalog";

const BASE = "/api/v1/providers";

type ServerStep = { id: string; label: string; ok: boolean; ms: number; detail: string };
export type ServerOutcome = { ok: boolean; verified: boolean; steps: ServerStep[]; models: { id: string; note: string }[]; ranAt: string };
export type ServerDetail = {
  id: string; slug: string; name: string; specId: string | null; kind: string; adapterType: string; baseUrl: string | null; region: string; priorityGroup: number; enabled: boolean;
  status: string; verified: boolean; verifiedAt: string | null; latencyMs: number | null; models: string[]; rpmLimit: number; tpmLimit: number;
  secretRefs: Record<string, string>; config: Record<string, string>; note: string | null; selfHosted: boolean; deploymentId: string | null; createdAt: string | null;
};
export type ServerRegistered = { provider: ServerDetail; outcome: ServerOutcome; warnings: string[] };
export type ServerTested = { provider: ServerDetail; outcome: ServerOutcome };

/** The field each refusal names, so the form can put the message next to it. */
export type FieldErrors = Record<string, string>;

const STEP_IDS = new Set(["reach", "auth", "models", "completion"]);

export function toTestOutcome(o: ServerOutcome, spec?: ProviderSpec): TestOutcome {
  const steps = o.steps.filter((s) => STEP_IDS.has(s.id)).map((s) => ({ id: s.id as CheckStep["id"], label: s.label, ok: s.ok, ms: s.ms, detail: s.detail }));
  // A provider that cannot be checked yet has no model list; the catalogue's suggestions let the person choose what to route.
  const models = o.models.length ? o.models : !o.verified && spec ? spec.discover : [];
  const at = new Date(o.ranAt);
  return { ok: o.ok, verified: o.verified, steps, models, ranAt: Number.isNaN(at.getTime()) ? o.ranAt : at.toLocaleTimeString("en-GB") };
}

export function toProvider(d: ServerDetail): Registered {
  const spec = SPECS.find((s) => s.id === d.specId);
  const status: Health = !d.enabled ? "down" : d.status === "healthy" ? "healthy" : d.status === "down" ? "down" : "degraded";
  const note = !d.enabled ? "Switched off. It receives no traffic until it is switched on again."
    : d.status === "degraded" && !d.verified ? "No test has passed yet. It stays degraded until one does."
    : d.status === "down" ? "The last test could not reach the provider." : d.note ?? undefined;
  const refs = Object.values(d.secretRefs);
  return {
    id: d.slug, name: d.name, kind: d.kind, icon: spec?.icon ?? null, region: d.region, priority: d.priorityGroup, status, models: d.models,
    p50: d.latencyMs ?? 0, p99: 0, errorRatePct: 0, requestsPerDay: 0, spendPerDayUsd: 0, rpmLimit: d.rpmLimit, tpmLimit: d.tpmLimit,
    secretRef: refs[0] ?? "none (no credential)", selfHosted: d.selfHosted, note: d.note && status === "healthy" ? d.note : note,
    // The registry holds registration facts and the last test. Traffic figures come from the gateway, so none are shown here.
    fresh: true, specId: d.specId ?? "", secretRefs: refs,
  };
}

export const liveApi = {
  test: async (specId: string, values: Record<string, string>, spec?: ProviderSpec): Promise<TestOutcome> =>
    toTestOutcome(await http.post<ServerOutcome>(`${BASE}/test`, { specId, values }), spec),

  list: async (orgId: string | null): Promise<Registered[]> => (await http.get<ServerDetail[]>(BASE, { tenantId: orgId })).map(toProvider),

  get: async (orgId: string | null, idOrSlug: string): Promise<Registered> => toProvider(await http.get<ServerDetail>(`${BASE}/${encodeURIComponent(idOrSlug)}`, { tenantId: orgId })),

  register: async (orgId: string | null, b: {
    specId: string; name: string; region: string; priority: number; models: string[]; rpm: number; tpm: number; values: Record<string, string>; acceptUnverified: boolean; note?: string;
  }): Promise<{ provider: Registered; outcome: TestOutcome; warnings: string[] }> => {
    const r = await http.post<ServerRegistered>(BASE, {
      tenantId: orgId, specId: b.specId, name: b.name, region: b.region, priorityGroup: b.priority, models: b.models, rpmLimit: b.rpm, tpmLimit: b.tpm, values: b.values,
      note: b.note, acceptUnverified: b.acceptUnverified,
    });
    return { provider: toProvider(r.provider), outcome: toTestOutcome(r.outcome), warnings: r.warnings };
  },

  testStored: async (orgId: string | null, idOrSlug: string): Promise<{ provider: Registered; outcome: TestOutcome }> => {
    const r = await http.post<ServerTested>(`${BASE}/${encodeURIComponent(idOrSlug)}/test-connection`, {}, { query: { tenantId: orgId } });
    return { provider: toProvider(r.provider), outcome: toTestOutcome(r.outcome) };
  },

  setEnabled: async (orgId: string | null, idOrSlug: string, enabled: boolean): Promise<Registered> =>
    toProvider(await http.put<ServerDetail>(`${BASE}/${encodeURIComponent(idOrSlug)}`, { enabled }, { query: { tenantId: orgId } })),

  rotate: async (orgId: string | null, idOrSlug: string, secrets: Record<string, string>): Promise<{ provider: Registered; outcome: TestOutcome }> => {
    const r = await http.post<ServerTested>(`${BASE}/${encodeURIComponent(idOrSlug)}/credentials/rotate`, { secrets }, { query: { tenantId: orgId } });
    return { provider: toProvider(r.provider), outcome: toTestOutcome(r.outcome) };
  },
};

export type { Provider };
