import { Badge } from "@/components/ui/Badge";
import type { KbRun, KbSource, KbStatus } from "@/lib/mlops/types";

export const KB_STATUS: Record<KbStatus, { tone: "healthy" | "degraded" | "info" | "neutral"; label: string }> = {
  ready: { tone: "healthy", label: "Ready" }, indexing: { tone: "info", label: "Indexing" }, degraded: { tone: "degraded", label: "Needs attention" }, empty: { tone: "neutral", label: "No sources" },
};
export const KbStatusBadge = ({ s }: { s: KbStatus }) => <Badge tone={KB_STATUS[s].tone}>{KB_STATUS[s].label}</Badge>;

const SRC = { synced: "healthy", syncing: "info", failed: "down", pending: "neutral" } as const;
export const SourceBadge = ({ s }: { s: KbSource["status"] }) => <Badge tone={SRC[s]}>{s}</Badge>;

const RUN = { succeeded: "healthy", partial: "degraded", failed: "down", running: "info" } as const;
export const RunBadge = ({ s }: { s: KbRun["state"] }) => <Badge tone={RUN[s]}>{s}</Badge>;

export const SCHEDULE_LABEL = { manual: "On demand", hourly: "Every hour", daily: "Every day", "on-change": "When a source changes" } as const;
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
