/**
 * Replays a sample day of traffic against an alias and a routing strategy, and reports what it would have cost and how it would have performed
 * next to the alias's default. This is a projection from a sample mix of tasks and a sample quality evaluation, not a measurement: it exists so a
 * routing change can be judged before it is turned on, and it says so on screen.
 */
import { ALIASES, MODELS, TASK_CLASSES, costPerRequest, modelById, type Alias, type Model, type Strategy, type TaskClass } from "./data";

export const SAMPLE_REQUESTS_PER_DAY = 120_000;

export type ClassResult = { cls: TaskClass; share: number; picks: { model: string; share: number }[]; costUsd: number; latencyMs: number; passPct: number };
export type Projection = { classes: ClassResult[]; costUsd: number; latencyMs: number; passPct: number };

function pickFor(chain: { model: string; weight?: number }[], strategy: Strategy, cls: TaskClass, floor: number): { model: Model; share: number }[] {
  const models = chain.map((c) => ({ m: modelById(c.model)!, w: c.weight ?? 1 })).filter((x) => x.m);
  const cls0 = TASK_CLASSES.find((t) => t.id === cls)!;
  if (strategy === "priority") return [{ model: models[0].m, share: 1 }];
  if (strategy === "weighted") { const t = models.reduce((s, x) => s + x.w, 0) || 1; return models.map((x) => ({ model: x.m, share: x.w / t })); }
  const ok = models.filter((x) => x.m.quality[cls] >= floor);
  const pool = ok.length ? ok : [models.reduce((a, b) => (b.m.quality[cls] > a.m.quality[cls] ? b : a))];
  const best = strategy === "cost-aware"
    ? pool.reduce((a, b) => (costPerRequest(b.m, cls0) < costPerRequest(a.m, cls0) ? b : a))
    : pool.reduce((a, b) => (b.m.latencyMs < a.m.latencyMs ? b : a));
  return [{ model: best.m, share: 1 }];
}

export function project(chain: { model: string; weight?: number }[], strategy: Strategy, floor: number, requestsPerDay = SAMPLE_REQUESTS_PER_DAY): Projection {
  const classes: ClassResult[] = TASK_CLASSES.map((c) => {
    const picks = pickFor(chain, strategy, c.id, floor);
    const n = requestsPerDay * c.share;
    const costUsd = picks.reduce((s, p) => s + n * p.share * costPerRequest(p.model, c), 0);
    const latencyMs = picks.reduce((s, p) => s + p.share * p.model.latencyMs, 0);
    const passPct = picks.reduce((s, p) => s + p.share * p.model.quality[c.id], 0);
    return { cls: c.id, share: c.share, picks: picks.map((p) => ({ model: p.model.id, share: p.share })), costUsd, latencyMs, passPct };
  });
  const costUsd = classes.reduce((s, c) => s + c.costUsd, 0);
  return { classes, costUsd, latencyMs: classes.reduce((s, c) => s + c.share * c.latencyMs, 0), passPct: classes.reduce((s, c) => s + c.share * c.passPct, 0) };
}

/** The projection of an alias as it is configured today: the baseline every candidate strategy is compared with. */
export const baselineFor = (a: Alias) => project(a.chain, a.strategy, a.qualityFloor);
export const aliasByName = (n: string) => ALIASES.find((a) => a.name === n);
export const knownModels = MODELS;
