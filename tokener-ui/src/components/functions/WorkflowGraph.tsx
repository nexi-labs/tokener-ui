"use client";

import clsx from "clsx";
import { FnIcon } from "./FnIcon";
import { STEP_ICON } from "./ui";
import type { ExecStep, WfStep } from "@/lib/functions/types";

const KIND_LABEL: Record<WfStep["kind"], string> = { trigger: "Trigger", function: "Function", ai: "AI call", condition: "Condition", policy: "Policy check", approval: "Human approval", connector: "Connector", output: "Output" };
export const WF_KIND_LABEL = KIND_LABEL;

const summary = (s: WfStep): string => {
  const c = s.config;
  switch (s.kind) {
    case "trigger": return c.topic ? `${c.source}: ${c.topic}` : c.cron ? `cron ${c.cron}` : String(c.source ?? "");
    case "function": return `${c.function}${c.model ? `, ${c.model}` : ""}`;
    case "ai": return `${c.model}, up to ${c.maxOutputTokens} output tokens`;
    case "condition": return String(c.expression ?? "");
    case "policy": return `${c.policy}, ${c.mode}`;
    case "approval": return `${c.approverRole} role, expires in ${c.expiresHours} h`;
    case "connector": return String(c.tool ?? c.operation ?? c.channel ?? c.connector ?? "");
    case "output": return String(c.emit ?? "");
  }
};

/** Read-only picture of a workflow: steps in order, branches labelled. Pass `status` to colour the steps of a run. */
export function WorkflowGraph({ steps, status, selected, onSelect }: { steps: WfStep[]; status?: Record<string, ExecStep["status"]>; selected?: string; onSelect?: (id: string) => void }) {
  const name = (id: string | null) => steps.find((x) => x.id === id)?.name ?? "end";
  const ring = (st?: ExecStep["status"]) => st === "failed" ? "border-status-down" : st === "blocked" ? "border-status-degraded" : st === "waiting" ? "border-status-info" : st === "succeeded" ? "border-accent-600" : "border-border";
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => (
        <li key={s.id} className="relative pl-12 pb-5 last:pb-0">
          {i < steps.length - 1 && <span aria-hidden className="absolute left-[19px] top-10 bottom-0 w-px bg-border-strong" />}
          <span className={clsx("absolute left-0 top-0 h-10 w-10 grid place-items-center rounded-lg border-2 bg-ink-800 text-accent-500", ring(status?.[s.id]))}><FnIcon name={STEP_ICON[s.kind]} size={19} /></span>
          <button type="button" onClick={() => onSelect?.(s.id)} disabled={!onSelect} className={clsx("block w-full text-left rounded-md px-2 -mx-2 py-0.5", onSelect && "hover:bg-surface-muted", selected === s.id && "bg-surface-muted")}>
            <div className="text-[11px] uppercase tracking-wide text-text-tertiary">{KIND_LABEL[s.kind]}{status?.[s.id] && <span className="ml-2 normal-case tracking-normal">{status[s.id]}</span>}</div>
            <div className="text-[14px] font-medium">{s.name}</div>
            <div className="text-xs text-text-secondary font-code truncate">{summary(s)}</div>
            {s.branches ? <div className="mt-1 flex flex-wrap gap-1.5">{s.branches.map((b) => <span key={b.label} className="text-[11px] rounded border border-border px-1.5 py-px text-text-secondary">{b.label} to {name(b.next)}</span>)}</div>
              : s.next && steps[i + 1]?.id !== s.next && <div className="text-[11px] text-text-tertiary mt-0.5">then {name(s.next)}</div>}
          </button>
        </li>
      ))}
    </ol>
  );
}
