import { Badge } from "@/components/ui/Badge";
import { ArrowRight, ArrowDown } from "lucide-react";

type Node = { name: string; region: string; state: "healthy" | "degraded" | "down"; note: string };

const NODES: Node[] = [
  { name: "OpenAI gpt-4o", region: "us-east", state: "degraded", note: "p95 4.1s, circuit half-open" },
  { name: "Anthropic claude-sonnet", region: "us-east", state: "healthy", note: "takes over after 2 failures" },
  { name: "Azure OpenAI gpt-4o", region: "eu-west", state: "healthy", note: "region pinned for EU tenants" },
  { name: "Self-hosted vLLM", region: "on-prem", state: "healthy", note: "last resort, no egress" },
];

export function FailoverGraph() {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-2">
      <div className="rounded-md bg-ink-800 text-text-inverse px-4 py-3 text-[13px] lg:w-40 shrink-0">
        <div className="font-medium">Gateway</div>
        <div className="text-xs text-text-tertiary mt-0.5">alias: chat-default</div>
      </div>
      <ArrowRight size={16} className="hidden lg:block text-text-tertiary shrink-0" />
      <ArrowDown size={16} className="lg:hidden text-text-tertiary self-center" />
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {NODES.map((n, i) => (
          <div key={n.name} className="relative rounded-md border border-border bg-surface px-3.5 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-text-tertiary tabular-nums">priority {i + 1}</span>
              <Badge tone={n.state}>{n.state}</Badge>
            </div>
            <div className="text-[13px] font-medium text-text-primary mt-1.5">{n.name}</div>
            <div className="text-xs text-text-tertiary">{n.region}</div>
            <div className="text-xs text-text-secondary mt-1.5 leading-snug">{n.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
