import type { Agent, AttrValue, Span, Trace } from "./types";
import type { MetricRow } from "./observe";
import { hops, logsOf, traceparentOf } from "./observe";

/**
 * Exports. A trace leaves tok∑ner as OpenTelemetry JSON (OTLP), Zipkin v2 JSON, plain JSON, CSV or log lines, so it can be opened in any tracing tool,
 * attached to a ticket or kept as evidence. Ids are the same ones shown on screen, so a trace can be matched across tools.
 */

export type TraceFormat = "otlp" | "zipkin" | "json" | "csv" | "logs";
export const TRACE_FORMATS: { id: TraceFormat; label: string; ext: string; mime: string; help: string }[] = [
  { id: "otlp", label: "OpenTelemetry (OTLP JSON)", ext: "otlp.json", mime: "application/json", help: "Send to any OpenTelemetry collector or open in Jaeger, Tempo or Grafana." },
  { id: "zipkin", label: "Zipkin v2 JSON", ext: "zipkin.json", mime: "application/json", help: "Post to a Zipkin server at /api/v2/spans." },
  { id: "json", label: "tok∑ner JSON", ext: "json", mime: "application/json", help: "The whole trace as it is stored, with logs and attributes." },
  { id: "csv", label: "Spans as CSV", ext: "csv", mime: "text/csv", help: "One row per span for a spreadsheet." },
  { id: "logs", label: "Log lines (NDJSON)", ext: "ndjson", mime: "application/x-ndjson", help: "One JSON line per log, each with trace, span and correlation ids." },
];

const ms = (n: number) => BigInt(Math.round(n));
const nanos = (traceStart: number, offsetMs: number) => (ms(traceStart) * BigInt(1_000_000) + ms(offsetMs) * BigInt(1_000_000)).toString();
const micros = (traceStart: number, offsetMs: number) => Math.round(traceStart * 1000 + offsetMs * 1000);

type AnyVal = { stringValue: string } | { intValue: string } | { doubleValue: number } | { boolValue: boolean };
const anyVal = (v: AttrValue): AnyVal => (typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { boolValue: v } : Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v });
const attrs = (o: Record<string, AttrValue | undefined>) => Object.entries(o).filter(([, v]) => v !== undefined).map(([key, v]) => ({ key, value: anyVal(v as AttrValue) }));

/** OpenTelemetry span kinds: 1 internal, 2 server, 3 client, 4 producer, 5 consumer. */
function spanKind(s: Span, byId: Map<string, Span>): number {
  const p = s.parent ? byId.get(s.parent) : undefined;
  if (s.attrs?.["messaging.system"] !== undefined) return 4;
  if (s.kind === "delegation" && s.attrs?.["peer.agent"]) return 3;
  if (s.kind === "delegation" && s.attrs?.["agent.name"]) return p && p.attrs?.["messaging.system"] !== undefined ? 5 : 2;
  return 1;
}
const zipkinKind = (k: number) => (k === 2 ? "SERVER" : k === 3 ? "CLIENT" : k === 4 ? "PRODUCER" : k === 5 ? "CONSUMER" : undefined);

export function toOtlp(traces: Trace[], agents: Agent[]) {
  const name = new Map(agents.map((a) => [a.id, a]));
  const groups = new Map<string, { agent: Agent | undefined; spans: unknown[] }>();
  for (const t of traces) {
    const t0 = Date.parse(t.startedAt); const byId = new Map(t.spans.map((s) => [s.id, s]));
    for (const s of t.spans) {
      const g = groups.get(s.agentId) ?? { agent: name.get(s.agentId), spans: [] };
      g.spans.push({
        traceId: t.id, spanId: s.id, ...(s.parent ? { parentSpanId: s.parent } : {}), name: s.name, kind: spanKind(s, byId),
        startTimeUnixNano: nanos(t0, s.startMs), endTimeUnixNano: nanos(t0, s.startMs + s.durMs),
        attributes: attrs({ ...s.attrs, "tokener.span.kind": s.kind, "tokener.correlation_id": t.correlationId, "tokener.session": t.session, "tokener.trace.kind": t.kind, "tokener.cost_usd": s.costUsd, "tokener.tokens": s.tokens || undefined }),
        events: (s.logs ?? []).map((l) => ({ timeUnixNano: nanos(t0, l.atMs), name: "log", attributes: attrs({ "log.severity": l.level, "log.message": l.msg }) })),
        status: s.status === "error" ? { code: 2, message: s.detail ?? "error" } : { code: 1 },
      });
      groups.set(s.agentId, g);
    }
  }
  return {
    resourceSpans: [...groups.entries()].map(([id, g]) => ({
      resource: { attributes: attrs({ "service.name": g.agent?.name ?? id, "service.version": g.agent?.version, "service.namespace": "tokener-agents", "tokener.agent.id": id, "tokener.agent.framework": g.agent?.framework, "tokener.control": g.agent?.control }) },
      scopeSpans: [{ scope: { name: "tokener.agent", version: "1" }, spans: g.spans }],
    })),
  };
}

export function toZipkin(traces: Trace[], agents: Agent[]) {
  const name = new Map(agents.map((a) => [a.id, a.name]));
  return traces.flatMap((t) => {
    const t0 = Date.parse(t.startedAt); const byId = new Map(t.spans.map((s) => [s.id, s]));
    return t.spans.map((s) => {
      const k = zipkinKind(spanKind(s, byId));
      const peer = typeof s.attrs?.["peer.agent"] === "string" ? String(s.attrs["peer.agent"]) : undefined;
      const tags: Record<string, string> = { "tokener.span.kind": s.kind, "tokener.correlation_id": t.correlationId, "tokener.cost_usd": String(s.costUsd) };
      for (const [key, v] of Object.entries(s.attrs ?? {})) tags[key] = String(v);
      if (s.status === "error") tags.error = s.detail ?? "error";
      return {
        traceId: t.id, id: s.id, ...(s.parent ? { parentId: s.parent } : {}), ...(k ? { kind: k } : {}), name: s.name, timestamp: micros(t0, s.startMs), duration: Math.max(1, Math.round(s.durMs * 1000)),
        localEndpoint: { serviceName: name.get(s.agentId) ?? s.agentId }, ...(peer ? { remoteEndpoint: { serviceName: peer } } : {}),
        annotations: (s.logs ?? []).filter((l) => l.level !== "debug").map((l) => ({ timestamp: micros(t0, l.atMs), value: `${l.level}: ${l.msg}` })), tags,
      };
    });
  });
}

/** Spreadsheet programs run any cell that starts with one of these, so such cells are written as plain text. */
const cell = (v: unknown): string => {
  let s = v === undefined || v === null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const csvLine = (xs: unknown[]) => xs.map(cell).join(",");

export function toCsv(traces: Trace[], agents: Agent[]): string {
  const name = new Map(agents.map((a) => [a.id, a.name]));
  const head = ["trace_id", "span_id", "parent_span_id", "correlation_id", "agent", "name", "kind", "started_at", "start_ms", "duration_ms", "status", "cost_usd", "tokens", "detail"];
  const rows = traces.flatMap((t) => t.spans.map((s) => csvLine([t.id, s.id, s.parent ?? "", t.correlationId, name.get(s.agentId) ?? s.agentId, s.name, s.kind, new Date(Date.parse(t.startedAt) + s.startMs).toISOString(), s.startMs, s.durMs, s.status, s.costUsd, s.tokens, s.detail ?? ""])));
  return [csvLine(head), ...rows].join("\n") + "\n";
}

export function toLogs(traces: Trace[], agents: Agent[]): string {
  const name = new Map(agents.map((a) => [a.id, a.name]));
  return traces.flatMap((t) => logsOf(t).map((l) => JSON.stringify({ timestamp: l.ts, severity: l.level.toUpperCase(), agent: name.get(l.agentId) ?? l.agentId, trace_id: l.traceId, span_id: l.spanId, correlation_id: l.correlationId, message: l.msg }))).join("\n") + "\n";
}

export function toJson(traces: Trace[]) {
  return traces.map((t) => ({ ...t, traceparent: traceparentOf(t), hops: hops(t).map((h) => ({ from: h.from, to: h.to, protocol: h.protocol, messageId: h.messageId, durMs: h.durMs, status: h.status })) }));
}

export function exportTraces(traces: Trace[], agents: Agent[], format: TraceFormat): string {
  switch (format) {
    case "otlp": return JSON.stringify(toOtlp(traces, agents), null, 2);
    case "zipkin": return JSON.stringify(toZipkin(traces, agents), null, 2);
    case "json": return JSON.stringify(traces.length === 1 ? toJson(traces)[0] : toJson(traces), null, 2);
    case "csv": return toCsv(traces, agents);
    case "logs": return toLogs(traces, agents);
  }
}

export function metricsCsv(rows: MetricRow[], agentName: string): string {
  const head = ["agent", "bucket", "runs", "failed", "error_pct", "p50_ms", "p95_ms", "p99_ms", "tokens", "cost_usd", "tool_calls"];
  return [csvLine(head), ...rows.map((r) => csvLine([agentName, new Date(r.at).toISOString(), r.runs, r.failed, r.errorPct, r.p50, r.p95, r.p99, r.tokens, r.costUsd, r.toolCalls]))].join("\n") + "\n";
}

/** Saves text as a file in the browser. Does nothing on the server. */
export function download(filename: string, text: string, mime: string) {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const fileFor = (id: string, fmt: TraceFormat) => `tokener-trace-${id.slice(0, 12)}.${TRACE_FORMATS.find((f) => f.id === fmt)!.ext}`;
