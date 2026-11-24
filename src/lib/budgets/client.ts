/**
 * The budget client. Live: GET /api/v1/budgets?tenantId=, POST /api/v1/budgets, DELETE /api/v1/budgets/{id} (which disables).
 * The API returns the configured limits and what happens on breach. It does not return running spend, so neither client does.
 * Sample: an in-memory store in the sample workspace.
 */
import { ApiError, http } from "@/lib/api/client";

export type ScopeType = "ORG" | "TENANT" | "DEPARTMENT" | "PROJECT" | "USER";
export type Metric = "COST" | "TOKENS";
export type Period = "DAILY" | "MONTHLY" | "CUSTOM";
export type BreachAction = "NONE" | "WARN" | "THROTTLE" | "BLOCK";

export type Budget = {
  id: string; scopeType: ScopeType; scopeId: string; metric: Metric; limitValue: number; currency: string | null;
  period: Period; onBreach: BreachAction; rollover: boolean; enabled: boolean;
};
export type NewBudget = {
  scopeType: ScopeType; scopeId: string; metric: Metric; limitValue: number; currency?: string; period: Period;
  customStart?: string; customEnd?: string; onBreach: BreachAction; rollover: boolean; tenantId: string;
};

export interface BudgetAdmin {
  mode: "live" | "sample";
  list(tenantId: string): Promise<Budget[]>;
  create(b: NewBudget): Promise<string>;
  disable(id: string): Promise<void>;
}

export const liveBudgets: BudgetAdmin = {
  mode: "live",
  list: async (tenantId) => (await http.get<Budget[]>("/api/v1/budgets", { tenantId })).map((b) => ({ ...b, limitValue: Number(b.limitValue) })),
  create: async (b) => (await http.post<{ id: string }>("/api/v1/budgets", b)).id,
  disable: (id) => http.delete(`/api/v1/budgets/${id}`),
};

const T1 = "00000000-0000-4000-8000-0000000000b1";
const T2 = "00000000-0000-4000-8000-0000000000b2";
const row = (n: number, tenantId: string, scopeType: ScopeType, scopeId: string, metric: Metric, limitValue: number, period: Period, onBreach: BreachAction, enabled = true): Budget & { tenantId: string } =>
  ({ id: `00000000-0000-4000-8000-0000000b${String(n).padStart(4, "0")}`, tenantId, scopeType, scopeId, metric, limitValue, currency: metric === "COST" ? "USD" : null, period, onBreach, rollover: false, enabled });
let store = [
  row(1, T1, "TENANT", T1, "COST", 60000, "MONTHLY", "THROTTLE"),
  row(2, T1, "PROJECT", "p-1", "COST", 500, "DAILY", "BLOCK"),
  row(3, T1, "DEPARTMENT", "d-2", "TOKENS", 20000000, "DAILY", "WARN"),
  row(4, T2, "TENANT", T2, "COST", 5000, "MONTHLY", "WARN"),
  row(5, T2, "PROJECT", "p-3", "TOKENS", 20000, "DAILY", "THROTTLE", false),
];

export const sampleBudgets: BudgetAdmin = {
  mode: "sample",
  list: async (tenantId) => store.filter((b) => b.tenantId === tenantId).map(({ tenantId: _t, ...b }) => b),
  create: async (b) => {
    if (!(b.limitValue > 0)) throw new ApiError(400, "invalid", "The limit must be greater than zero.");
    const id = `00000000-0000-4000-8000-0000000b${String(store.length + 1).padStart(4, "0")}`;
    store = [...store, { id, tenantId: b.tenantId, scopeType: b.scopeType, scopeId: b.scopeId, metric: b.metric, limitValue: b.limitValue, currency: b.metric === "COST" ? b.currency ?? "USD" : null, period: b.period, onBreach: b.onBreach, rollover: b.rollover, enabled: true }];
    return id;
  },
  disable: async (id) => { store = store.map((b) => (b.id === id ? { ...b, enabled: false } : b)); },
};
