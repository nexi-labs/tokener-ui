/**
 * Sensor data quality. Time series from machines fail in ways tables of orders do not: samples go missing, a sensor sticks at one value, a reading
 * jumps, a unit changes, a sentinel such as -999 stands in for "no value". This module finds those problems in the rows a dataset keeps for profiling
 * and scores each signal. Nothing here changes data. It runs in the browser on the stored sample rows, so figures describe the sample, not the whole input.
 *
 * The score is a documented product choice, inspired by the kinds of sensor anomalies that ISO 8000-210 addresses. It is not a conformance claim.
 */
import type { Cell, ColRole, ColType, Row } from "./types";

export type SensorColumn = { name: string; type: ColType; role: ColRole };
export type Unit = { label: string; min: number; max: number };
export type Pt = { t: number; v: number | null; flag?: "gap" | "flatline" | "spike" | "shift" | "implausible" };
export type SeriesReport = {
  entity: string; column: string; unit: Unit | null; n: number; intervalMs: number; regularity: number;
  gaps: { count: number; missing: number; longestMs: number }; flatlines: { runs: number; samples: number }; spikes: { count: number }; shifts: { runs: number; samples: number };
  implausible: { count: number; sentinels: number }; nulls: number; unordered: number; duplicateTime: number; drift: { shift: number; flagged: boolean };
  score: number; points: Pt[];
};
export type SensorReport = {
  timeColumn: string; entityColumn: string | null; series: SeriesReport[]; score: number; rows: number;
  totals: { gaps: number; missing: number; flatlineSamples: number; spikes: number; shiftSamples: number; implausible: number; nulls: number; duplicateTime: number };
  recommendations: string[]; weights: typeof SENSOR_WEIGHTS; basis: string;
};

/** Each share is multiplied by 5 and capped at 1 before its weight applies, so a problem touching a fifth of the samples costs its whole weight. */
export const SENSOR_WEIGHTS = { gaps: 30, flatline: 25, spikes: 15, implausible: 15, missingValues: 10, ordering: 5 } as const;
export const SENSOR_FORMULA = `Signal score = 100 minus ${SENSOR_WEIGHTS.gaps} x gaps, ${SENSOR_WEIGHTS.flatline} x flatline, ${SENSOR_WEIGHTS.spikes} x spikes, ${SENSOR_WEIGHTS.implausible} x implausible values, ${SENSOR_WEIGHTS.missingValues} x empty values and ${SENSOR_WEIGHTS.ordering} x ordering problems. Each term is the share of samples affected times 5, capped at 1.`;

const TIME_NAME = /(^|_)(ts|time|timestamp|datetime|recorded|measured|sampled|event_time|created_at)($|_)/i;
const ENTITY_NAME = /(sensor|device|asset|machine|equipment|unit|line|tag|station|node|plc)(_?id|_?name)?$/i;
const IGNORE_NAME = /(^|_)(id|index|seq|sequence|count|batch|lot|flag|status|code|quality|ok)($|_)/i;

/** Plausible ranges from the column name. A hint to review, not a law of physics. */
export function unitOf(name: string): Unit | null {
  const n = name.toLowerCase();
  if (/(^|_)(degf|f|fahrenheit)($|_)|_f$/.test(n)) return { label: "degF", min: -76, max: 392 };
  if (/temp|degc|celsius|(^|_)c$/.test(n)) return { label: "degC", min: -60, max: 200 };
  if (/kpa/.test(n)) return { label: "kPa", min: 0, max: 10000 };
  if (/psi/.test(n)) return { label: "psi", min: 0, max: 10000 };
  if (/(^|_)bar($|_)/.test(n)) return { label: "bar", min: 0, max: 700 };
  if (/press/.test(n)) return { label: "pressure", min: 0, max: 100000 };
  if (/humid|(^|_)(pct|percent)($|_)|_pct$/.test(n)) return { label: "%", min: 0, max: 100 };
  if (/vibr|mm_s/.test(n)) return { label: "mm/s", min: 0, max: 200 };
  if (/rpm/.test(n)) return { label: "rpm", min: 0, max: 30000 };
  if (/flow|level|power|(^|_)kw($|_)|current|(^|_)amps?($|_)/.test(n)) return { label: "", min: 0, max: Infinity };
  return null;
}

const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const SENTINELS = new Set([-999, -9999, -99999, 9999, 99999, 999999, -1e9]);

function parseTime(v: Cell): number | null { if (typeof v !== "string") return null; const t = Date.parse(v); return Number.isFinite(t) ? t : null; }

function analyseSeries(entity: string, column: string, rows: { t: number; v: number | null }[], unit: Unit | null): SeriesReport {
  const pts: Pt[] = rows.map((r) => ({ t: r.t, v: r.v }));
  const n = pts.length;
  let unordered = 0; for (let i = 1; i < n; i++) if (pts[i].t < pts[i - 1].t) unordered++;
  pts.sort((a, b) => a.t - b.t);
  let dup = 0; const dts: number[] = [];
  for (let i = 1; i < n; i++) { const d = pts[i].t - pts[i - 1].t; if (d === 0) dup++; else dts.push(d); }
  const interval = median(dts); const near = dts.filter((d) => interval > 0 && d >= interval * 0.5 && d <= interval * 1.5).length;
  const regularity = dts.length ? near / dts.length : 1;

  // Gaps: a step much longer than the usual interval means samples are missing.
  let gapCount = 0, missing = 0, longest = 0;
  for (let i = 1; i < n; i++) { const d = pts[i].t - pts[i - 1].t; if (interval > 0 && d > interval * 3) { gapCount++; missing += Math.max(1, Math.round(d / interval) - 1); longest = Math.max(longest, d); pts[i].flag ??= "gap"; } }

  const vals = pts.map((p) => p.v).filter((v): v is number => v !== null);
  const nulls = n - vals.length;
  const distinct = new Set(vals).size;

  // Flatline: the same value, repeated, in a signal that otherwise varies.
  let runs = 0, flatSamples = 0;
  if (distinct >= 4) {
    let i = 0;
    while (i < n) {
      if (pts[i].v === null) { i++; continue; }
      let j = i; while (j + 1 < n && pts[j + 1].v === pts[i].v) j++;
      if (j - i + 1 >= 5) { runs++; flatSamples += j - i + 1; for (let k = i; k <= j; k++) pts[k].flag ??= "flatline"; }
      i = j + 1;
    }
  }

  // Implausible: outside the range the name implies, or a known sentinel for "no value".
  let implausible = 0, sentinels = 0;
  for (const p of pts) {
    if (p.v === null) continue;
    const isSentinel = SENTINELS.has(p.v); const out = unit ? p.v < unit.min || p.v > unit.max : false;
    if (isSentinel) sentinels++;
    if (isSentinel || out) { implausible++; p.flag = "implausible"; }
  }

  // Spikes: far from the local median, judged against the typical size of such deviations. Implausible points are left out so a sentinel does not hide a real spike.
  const clean = pts.map((p) => (p.v !== null && p.flag !== "implausible" ? p.v : null));
  const res: (number | null)[] = clean.map((v, i) => { if (v === null) return null; const w = clean.slice(Math.max(0, i - 3), i + 4).filter((x): x is number => x !== null); return v - median(w); });
  const rs = res.filter((x): x is number => x !== null);
  const mad = median(rs.map((x) => Math.abs(x - median(rs)))) * 1.4826;
  const sigma = Math.max(mad, 1e-9, (Math.max(...clean.filter((x): x is number => x !== null), 0) - Math.min(...clean.filter((x): x is number => x !== null), 0)) * 0.005);
  let spikes = 0;
  res.forEach((x, i) => { if (x !== null && Math.abs(x) > 6 * sigma && pts[i].flag !== "flatline") { spikes++; pts[i].flag = "spike"; } });

  const good = clean.filter((x): x is number => x !== null);
  // Level shift: a stretch of readings that all sit far from the rest of the signal. A typical sign of mixed units (degrees Fahrenheit in a Celsius column) or a recalibration.
  let shiftRuns = 0, shiftSamples = 0;
  if (good.length >= 30) {
    const center = median(good); const spread = Math.max(1.4826 * median(good.map((x) => Math.abs(x - center))), (Math.max(...good) - Math.min(...good)) * 0.005, 1e-9);
    let i = 0;
    while (i < n) {
      const far = (k: number) => clean[k] !== null && pts[k].flag !== "flatline" && Math.abs((clean[k] as number) - center) > 6 * spread;
      if (!far(i)) { i++; continue; }
      let j = i; while (j + 1 < n && (far(j + 1) || clean[j + 1] === null)) j++;
      const len = pts.slice(i, j + 1).filter((_, k) => clean[i + k] !== null).length;
      if (len >= 4) { shiftRuns++; shiftSamples += len; for (let k = i; k <= j; k++) if (clean[k] !== null) pts[k].flag = "shift"; }
      i = j + 1;
    }
  }

  // Drift: the average moves by more than one and a half standard deviations between the first and last third.
  let shift = 0;
  if (good.length >= 30) {
    const third = Math.floor(good.length / 3); const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    const m = avg(good); const sd = Math.sqrt(good.reduce((s, x) => s + (x - m) ** 2, 0) / good.length) || 1;
    shift = (avg(good.slice(-third)) - avg(good.slice(0, third))) / sd;
  }

  const total = n + missing;
  const cap = (share: number) => Math.min(1, share * 5);
  const penalty = SENSOR_WEIGHTS.gaps * cap(missing / Math.max(1, total)) + SENSOR_WEIGHTS.flatline * cap(flatSamples / Math.max(1, n)) + SENSOR_WEIGHTS.spikes * cap((pts.filter((p) => p.flag === "spike").length + shiftSamples) / Math.max(1, n))
    + SENSOR_WEIGHTS.implausible * cap(implausible / Math.max(1, n)) + SENSOR_WEIGHTS.missingValues * cap(nulls / Math.max(1, n)) + SENSOR_WEIGHTS.ordering * cap((unordered + dup) / Math.max(1, n));
  return {
    entity, column, unit, n, intervalMs: interval, regularity: Math.round(regularity * 1000) / 10,
    gaps: { count: gapCount, missing, longestMs: longest }, flatlines: { runs, samples: flatSamples }, spikes: { count: pts.filter((p) => p.flag === "spike").length }, shifts: { runs: shiftRuns, samples: shiftSamples }, implausible: { count: implausible, sentinels },
    nulls, unordered, duplicateTime: dup, drift: { shift: Math.round(shift * 100) / 100, flagged: Math.abs(shift) > 1.5 }, score: Math.max(0, Math.round(100 - penalty)), points: pts,
  };
}

/** Finds the time column, an optional entity column and the measurement columns, then analyses every signal of every entity. Returns null when the data is not a time series. */
export function analyseSensors(columns: SensorColumn[], rows: Row[]): SensorReport | null {
  if (rows.length < 20) return null;
  const timeCol = columns.find((c) => (c.type === "timestamp" || c.type === "date") && TIME_NAME.test(c.name)) ?? columns.find((c) => c.type === "timestamp");
  if (!timeCol) return null;
  const times = rows.map((r) => parseTime(r[timeCol.name] ?? null));
  if (times.filter((t) => t !== null).length < rows.length * 0.9) return null;
  const measures = columns.filter((c) => (c.type === "decimal" || c.type === "integer") && c.role !== "identifier" && c.role !== "label" && !IGNORE_NAME.test(c.name));
  if (!measures.length) return null;
  const entityCol = columns.find((c) => c.type === "string" && c.role !== "label" && ENTITY_NAME.test(c.name) && new Set(rows.map((r) => String(r[c.name] ?? ""))).size <= 60);

  const groups = new Map<string, number[]>();
  rows.forEach((r, i) => { const k = entityCol ? String(r[entityCol.name] ?? "unknown") : "all"; (groups.get(k) ?? groups.set(k, []).get(k)!).push(i); });
  const series: SeriesReport[] = [];
  for (const [entity, idx] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (idx.length < 20) continue;
    for (const m of measures) {
      const rs = idx.filter((i) => times[i] !== null).map((i) => { const v = rows[i][m.name]; return { t: times[i] as number, v: typeof v === "number" ? v : null }; });
      series.push(analyseSeries(entity, m.name, rs, unitOf(m.name)));
    }
  }
  if (!series.length) return null;
  const sum = (f: (s: SeriesReport) => number) => series.reduce((a, s) => a + f(s), 0);
  // Gaps and repeated timestamps belong to a machine's clock, not to one signal, so they are counted once per machine.
  const perEntity = (f: (s: SeriesReport) => number) => [...new Set(series.map((s) => s.entity))].reduce((a, e) => a + Math.max(...series.filter((s) => s.entity === e).map(f)), 0);
  const totals = { gaps: perEntity((s) => s.gaps.count), missing: perEntity((s) => s.gaps.missing), flatlineSamples: sum((s) => s.flatlines.samples), spikes: sum((s) => s.spikes.count), shiftSamples: sum((s) => s.shifts.samples), implausible: sum((s) => s.implausible.count), nulls: sum((s) => s.nulls), duplicateTime: perEntity((s) => s.duplicateTime) };
  const score = Math.round(sum((s) => s.score * s.n) / Math.max(1, sum((s) => s.n)));

  const rec: string[] = [];
  if (totals.gaps) rec.push(`Gaps: ${totals.gaps} gap${totals.gaps === 1 ? "" : "s"}, about ${totals.missing} samples missing. Decide whether to fill them (Fill missing values) or keep them explicit, and never fill across a long outage.`);
  if (totals.flatlineSamples) rec.push(`Flatlines: ${totals.flatlineSamples} samples repeat one value for five or more readings. A stuck sensor looks healthy to a model. Reject them with Validate against a rule, or drop them.`);
  if (totals.spikes) rec.push(`Spikes: ${totals.spikes} reading${totals.spikes === 1 ? "" : "s"} ${totals.spikes === 1 ? "jumps" : "jump"} far from their neighbours. Use Clip outliers for noise, and keep the row when the jump is a real event.`);
  if (totals.shiftSamples) rec.push(`Level shifts: ${totals.shiftSamples} samples sit far from the rest of their signal for a stretch (${series.filter((x) => x.shifts.runs).map((x) => `${x.entity !== "all" ? `${x.entity} ` : ""}${x.column}`).slice(0, 3).join(", ")}). This often means mixed units, such as degrees Fahrenheit in a Celsius column, or a recalibration. Check the source, convert, then Validate.`);
  if (totals.implausible) rec.push(`Implausible values: ${totals.implausible} reading${totals.implausible === 1 ? " is" : "s are"} outside the range the column name implies, or equal to a sentinel such as -999. Validate with a range rule so they are rejected with the reason.`);
  if (totals.duplicateTime) rec.push(`Repeated timestamps: ${totals.duplicateTime}. Drop duplicates on the entity and time columns.`);
  const drifting = series.filter((s) => s.drift.flagged); if (drifting.length) rec.push(`Possible drift in ${drifting.map((s) => `${s.entity !== "all" ? `${s.entity} ` : ""}${s.column}`).slice(0, 4).join(", ")}. Compare with the last calibration before training on it.`);
  const units = series.filter((s) => s.implausible.count > s.implausible.sentinels && s.unit); if (units.length) rec.push(`Check units: ${[...new Set(units.map((s) => s.column))].slice(0, 4).join(", ")} hold values outside the range their name implies. Different units may be mixed. Convert before merging sources.`);
  if (!rec.length) rec.push("No sensor anomalies were found in the sample.");

  return { timeColumn: timeCol.name, entityColumn: entityCol?.name ?? null, series, score, rows: rows.length, totals, recommendations: rec, weights: SENSOR_WEIGHTS,
    basis: `Analysed ${rows.length} stored sample rows, ${series.length} signals. Gaps are steps longer than three times the usual interval. A flatline is five or more identical readings in a signal with at least four distinct values. A spike is more than six robust standard deviations from the local median. A level shift is four or more readings in a row that far from the whole signal's median. Ranges come from column names and are hints to review.` };
}

export function intervalLabel(ms: number): string {
  if (!ms) return "n/a"; const s = ms / 1000;
  if (s < 90) return `${Math.round(s)} s`; if (s < 5400) return `${Math.round(s / 60)} min`; if (s < 172800) return `${Math.round(s / 3600)} h`; return `${Math.round(s / 86400)} d`;
}
