import clsx from "clsx";

type BadgeTone = "healthy" | "degraded" | "down" | "info" | "neutral";

const TONE_STYLES: Record<BadgeTone, string> = {
  healthy: "bg-status-healthy/10 text-status-healthy",
  degraded: "bg-status-degraded/10 text-status-degraded",
  down: "bg-status-down/10 text-status-down",
  info: "bg-status-info/10 text-status-info",
  neutral: "bg-surface-muted text-text-secondary",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium",
        TONE_STYLES[tone]
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", {
        "bg-status-healthy": tone === "healthy",
        "bg-status-degraded": tone === "degraded",
        "bg-status-down": tone === "down",
        "bg-status-info": tone === "info",
        "bg-text-tertiary": tone === "neutral",
      })} />
      {children}
    </span>
  );
}
