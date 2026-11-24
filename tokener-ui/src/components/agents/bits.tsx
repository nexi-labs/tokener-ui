"use client";

import clsx from "clsx";
import { Badge } from "@/components/ui/Badge";
import { NodeIcon } from "@/components/studio/icons";
import { useMemo, useState } from "react";
import { Bot, Check, Copy } from "lucide-react";
import { ADAPTER_BY_ID } from "@/lib/agents/adapters";
import { agentColors } from "@/lib/agents/observe";
import { useAgents } from "@/lib/agents/store";
import { CONTROL_HELP, CONTROL_LABEL, type AgentState, type ControlLevel, type Risk, type StepKind } from "@/lib/agents/types";

export const ControlBadge = ({ c }: { c: ControlLevel }) => (
  <span title={CONTROL_HELP[c]}><Badge tone={c === "governed" ? "healthy" : c === "observed" ? "info" : "neutral"}>{CONTROL_LABEL[c]}</Badge></span>
);
export const StateBadge = ({ s }: { s: AgentState }) => <Badge tone={s === "active" ? "healthy" : s === "suspended" ? "degraded" : "neutral"}>{s === "active" ? "Active" : s === "suspended" ? "Suspended" : "Retired"}</Badge>;
export const RiskBadge = ({ r }: { r: Risk }) => <Badge tone={r === "high" ? "down" : r === "medium" ? "degraded" : "neutral"}>{r === "high" ? "High risk" : r === "medium" ? "Medium risk" : "Low risk"}</Badge>;

export function FrameworkMark({ id, size = 18, withName }: { id: string; size?: number; withName?: boolean }) {
  const a = ADAPTER_BY_ID[id];
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <span className="grid place-items-center rounded-md bg-surface-muted shrink-0" style={{ width: size + 10, height: size + 10 }}>
        {a ? <NodeIcon icon={a.icon} size={size} /> : <Bot size={size} className="text-text-secondary" />}
      </span>
      {withName && <span className="truncate text-sm">{a?.name ?? id}</span>}
    </span>
  );
}

export const KIND_LABEL: Record<StepKind, string> = { llm: "Model call", tool: "Tool", mcp: "MCP tool", retrieval: "Retrieval", delegation: "Agent run or hand-off", memory: "Memory", guardrail: "Policy check", eval: "Score" };
export const KIND_COLOR: Record<StepKind, string> = { llm: "var(--chart-s1)", mcp: "var(--chart-s2)", tool: "var(--chart-s2)", retrieval: "var(--chart-s3)", delegation: "var(--text-tertiary, #8A9A9E)", memory: "#8E5BD0", guardrail: "#CA8A04", eval: "#D6336C" };

/** A horizontal bar for a share of a whole, with the figure beside it. */
export function ShareBar({ value, max = 1, tone, label }: { value: number; max?: number; tone?: "warn" | "bad"; label?: string }) {
  const w = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="h-1.5 flex-1 rounded-full bg-surface-muted overflow-hidden" role="img" aria-label={label}>
        <div className={clsx("h-full rounded-full", tone === "bad" ? "bg-status-down" : tone === "warn" ? "bg-status-degraded" : "bg-[var(--chart-s3)]")} style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}

export function Section({ title, hint, action, children, className }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={clsx("space-y-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <div><h2 className="text-sm font-semibold text-text-primary">{title}</h2>{hint && <p className="text-xs text-text-tertiary mt-0.5 max-w-xl">{hint}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One colour for each agent, the same on every screen. */
export function useAgentColors(): Record<string, string> {
  const { agents } = useAgents();
  return useMemo(() => agentColors(agents), [agents]);
}

export const AgentDot = ({ color, size = 10 }: { color: string; size?: number }) => <span className="inline-block rounded-full shrink-0" style={{ width: size, height: size, background: color }} aria-hidden />;

export function AgentChip({ name, color, muted, onClick, active }: { name: string; color: string; muted?: boolean; onClick?: () => void; active?: boolean }) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag onClick={onClick} aria-pressed={onClick ? !!active : undefined} className={clsx("inline-flex items-center gap-1.5 max-w-full rounded-full border px-2 py-0.5 text-[12px] leading-5 whitespace-nowrap",
      active ? "border-text-primary bg-surface-muted" : "border-border bg-surface", muted && "opacity-45", onClick && "hover:bg-surface-muted")}>
      <AgentDot color={color} size={8} /><span className="truncate">{name}</span>
    </Tag>
  );
}

/** A value that can be copied, such as a trace id. Shows the start of it unless `full` is set. */
export function CopyId({ value, label, full, mono = true }: { value: string; label?: string; full?: boolean; mono?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" title={`Copy ${label ?? "value"}: ${value}`} aria-label={`Copy ${label ?? value}`}
      onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); } catch { /* clipboard blocked */ } }}
      className={clsx("inline-flex items-center gap-1.5 rounded px-1 -mx-1 hover:bg-surface-muted text-left min-w-0", mono && "font-mono text-[12px]")}>
      <span className={clsx(!full && "truncate")}>{full ? value : value.length > 16 ? value.slice(0, 8) + "\u2026" + value.slice(-4) : value}</span>
      {done ? <Check size={12} className="text-status-healthy shrink-0" /> : <Copy size={12} className="text-text-tertiary shrink-0" />}
    </button>
  );
}
