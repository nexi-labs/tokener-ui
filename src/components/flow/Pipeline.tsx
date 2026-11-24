import { ArrowRight, ArrowDown, type LucideIcon } from "lucide-react";
import clsx from "clsx";

export type Step = {
  title: string;
  detail?: string;
  icon?: LucideIcon;
  tone?: "default" | "accent" | "warn";
  /** Outcome when this stage rejects the request, shown beneath the node. */
  reject?: string;
};

/**
 * Left to right on wide screens, top to bottom on narrow ones.
 * Each node can carry a reject outcome so the graph reads as a gate sequence.
 */
export function Pipeline({ steps, dense, vertical, animated }: { steps: Step[]; dense?: boolean; vertical?: boolean; animated?: boolean }) {
  const per = 1.1;
  const total = steps.length * per + 1.5;
  return (
    <div className={clsx("flex flex-col gap-0", !vertical && "lg:flex-row lg:items-stretch")}>
      {steps.map((s, i) => {
        const Icon = s.icon;
        return (
          <div key={s.title} className={clsx("flex flex-col min-w-0", !vertical && "lg:flex-row lg:items-stretch lg:flex-1")}>
            <div className="flex flex-col flex-1 min-w-0">
              <div
                className={clsx(
                  "relative rounded-md border px-3.5 py-3 flex-1",
                  s.tone === "accent" && "border-accent-600/40 bg-accent-50",
                  s.tone === "warn" && "border-status-degraded/40 bg-status-degraded/5",
                  (!s.tone || s.tone === "default") && "border-border bg-surface"
                )}
              >
                {animated && <span aria-hidden className="tok-step tok-keep absolute inset-0 rounded-md border-2 border-accent-500 shadow-[0_0_0_4px_rgba(2,245,161,0.12)]" style={{ animationDuration: `${total}s`, animationDelay: `${i * per}s` }} />}
                <div className="flex items-center gap-2">
                  {Icon && <Icon size={15} strokeWidth={1.75} className="text-text-secondary shrink-0" />}
                  <span className={clsx("font-medium text-text-primary", dense ? "text-xs" : "text-[13px]")}>{s.title}</span>
                </div>
                {s.detail && <p className="text-xs text-text-tertiary mt-1 leading-snug">{s.detail}</p>}
              </div>
              {s.reject && (
                <div className="flex flex-col items-center">
                  <span className="h-3 w-px bg-status-down/40" />
                  <span className="text-[11px] text-status-down bg-status-down/10 rounded px-2 py-0.5 text-center">
                    {s.reject}
                  </span>
                </div>
              )}
            </div>
            {i < steps.length - 1 && (
              <div className={clsx("flex items-center justify-center text-text-tertiary py-1.5", !vertical && "lg:py-0 lg:px-1.5")}>
                {!vertical && <ArrowRight size={16} className={clsx("hidden lg:block", animated && "tok-step-arrow tok-keep")} style={animated ? { animationDuration: `${total}s`, animationDelay: `${i * per + 0.5}s` } : undefined} />}
                <ArrowDown size={16} className={clsx(!vertical && "lg:hidden")} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
