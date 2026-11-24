/**
 * The quota client. Live: GET /api/v1/quotas?tenantId=, POST /api/v1/quotas, DELETE /api/v1/quotas/{id} (which disables).
 * The API returns the configured limits and windows. It does not return how much of a window has been used, so neither client does.
 * Sample: an in-memory store in the sample workspace.
 */
import { ApiError, http } from "@/lib/api/client";

export type ScopeType = "ORG" | "TENANT" | "PROJECT" | "APPLICATION" | "USER";
export type Metric = "REQUESTS" | "TOKENS" | "IMAGES" | "EMBEDDINGS" | "SPEECH_SECONDS";
export type WindowType = "SLIDING" | "FIXED";
/** The only window specs the quota check can read: sliding "1m" or "1h", fixed "daily". */
export type WindowChoice = { value: string; label: string; windowType: WindowType; windowSpec: string };
export const WINDOWS: WindowChoice[] = [
  { value: "1m", label: "Per minute (sliding)", windowType: "SLIDING", windowSpec: "1m" },
  { value: "1h", label: "Per hour (sliding)", windowType: "SLIDING", windowSpec: "1h" },
  { value: "daily", label: "Per day (fixed)", windowType: "FIXED", windowSpec: "daily" },
];
export const METRICS: { value: Metric; label: string; unit: string }[] = [
  { value: "REQUESTS", label: "Requests", unit: "requests" }, { value: "TOKENS", label: "Tokens", unit: "tokens" },
  { value: "IMAGES", label: "Images", unit: "images" }, { value: "EMBEDDINGS", label: "Embeddings", unit: "embeddings" },
  { value: "SPEECH_SECONDS", label: "Speech seconds", unit: "seconds" },
];

export type Quota = { id: string; scopeType: ScopeType; scopeId: string; metric: Metric; windowType: WindowType; windowSpec: string; limitValue: number; enabled: boolean };
export type NewQuota = { scopeType: ScopeType; scopeId: string; metric: Metric; windowType: WindowType; windowSpec: string; limitValue: number; tenantId: string };

export interface QuotaAdmin {
  mode: "live" | "sample";
  list(tenantId: string): Promise<Quota[]>;
  create(q: NewQuota): Promise<string>;
  disable(id: string): Promise<void>;
}

export const liveQuotas: QuotaAdmin = {
  mode: "live",
  list: (tenantId) => http.get<Quota[]>("/api/v1/quotas", { tenantId }),
  create: async (q) => (await http.post<{ id: string }>("/api/v1/quotas", q)).id,
  disable: (id) => http.delete(`/api/v1/quotas/${id}`),
};

const T1 = "00000000-0000-4000-8000-0000000000b1";
const T2 = "00000000-0000-4000-8000-0000000000b2";
const row = (n: number, tenantId: string, scopeType: ScopeType, scopeId: string, metric: Metric, windowType: WindowType, windowSpec: string, limitValue: number, enabled = true): Quota & { tenantId: string } =>
  ({ id: `00000000-0000-4000-8000-0000000c${String(n).padStart(4, "0")}`, tenantId, scopeType, scopeId, metric, windowType, windowSpec, limitValue, enabled });
let store = [
  row(1, T1, "APPLICATION", "a-1", "REQUESTS", "SLIDING", "1m", 600),
  row(2, T1, "APPLICATION", "a-1", "TOKENS", "SLIDING", "1h", 2_000_000),
  row(3, T1, "PROJECT", "p-2", "REQUESTS", "SLIDING", "1m", 60, false),
  row(4, T2, "TENANT", T2, "IMAGES", "FIXED", "daily", 500),
];

export const sampleQuotas: QuotaAdmin = {
  mode: "sample",
  list: async (tenantId) => store.filter((q) => q.tenantId === tenantId).map(({ tenantId: _t, ...q }) => q),
  create: async (q) => {
    const ok = q.windowType === "FIXED" ? q.windowSpec === "daily" : q.windowSpec === "1m" || q.windowSpec === "1h";
    if (!ok) throw new ApiError(400, "invalid", "That window is not supported.");
    if (!(q.limitValue > 0)) throw new ApiError(400, "invalid", "The limit must be greater than zero.");
    const id = `00000000-0000-4000-8000-0000000c${String(store.length + 1).padStart(4, "0")}`;
    store = [...store, { id, enabled: true, ...q }];
    return id;
  },
  disable: async (id) => { store = store.map((q) => (q.id === id ? { ...q, enabled: false } : q)); },
};
