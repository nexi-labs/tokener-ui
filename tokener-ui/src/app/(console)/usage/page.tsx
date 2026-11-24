import { SampleGate } from "@/components/gateway/SampleGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { ChevronLeft, ChevronRight, Activity } from "lucide-react";
import Link from "next/link";

const REQUESTS = [
  { id: "01J8X...4F2A", trace: "ok", model: "claude-sonnet-5", provider: "Anthropic", tokens: "1,562", cost: "$0.024", latency: "842ms", status: "success" as const },
  { id: "01J8X...4E19", trace: "document", model: "gpt-5", provider: "OpenAI", tokens: "3,204", cost: "$0.081", latency: "1.1s", status: "success" as const },
  { id: "01J8X...4D0B", trace: "failover", model: "gemini-2-5-pro", provider: "Gemini", tokens: "890", cost: "$0.006", latency: "2.4s", status: "error" as const },
  { id: "01J8X...4C77", trace: "throttle", model: "llama-3-70b", provider: "Self-hosted", tokens: "2,110", cost: "$0.00", latency: "310ms", status: "success" as const },
];

export default function UsagePage() {
  return (
    <SampleGate title="Usage Explorer" description="Request-level drill-down with token counts, cost, latency, and status.">
      <PageHeader
        title="Usage Explorer"
        description="Request-level drill-down with token counts, cost, latency, and status."
      />

      <Card>
        <Table>
          <Thead>
            <tr>
              <Th>Request ID</Th>
              <Th>Model</Th>
              <Th>Provider</Th>
              <Th>Tokens</Th>
              <Th>Cost</Th>
              <Th>Latency</Th>
              <Th>Status</Th>
              <Th>Trace</Th>
            </tr>
          </Thead>
          <tbody>
            {REQUESTS.map((r) => (
              <Tr key={r.id}>
                <Td><span className="font-mono text-xs">{r.id}</span></Td>
                <Td><span className="font-mono">{r.model}</span></Td>
                <Td className="text-text-secondary">{r.provider}</Td>
                <Td className="tabular-nums">{r.tokens}</Td>
                <Td className="tabular-nums">{r.cost}</Td>
                <Td className="tabular-nums">{r.latency}</Td>
                <Td>
                  <Badge tone={r.status === "success" ? "healthy" : "down"}>{r.status}</Badge>
                </Td>
                <Td>
                  <Link href={`/trace-studio?req=${r.trace}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-700 hover:underline">
                    <Activity size={13} /> View trace
                  </Link>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>

        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <span className="text-xs text-text-tertiary">Showing 1 to 4 of 18,412,003 requests</span>
          <div className="flex items-center gap-1">
            <button className="h-8 w-8 rounded-md border border-border-strong flex items-center justify-center text-text-tertiary hover:bg-surface-muted">
              <ChevronLeft size={14} />
            </button>
            <button className="h-8 w-8 rounded-md border border-border-strong flex items-center justify-center text-text-tertiary hover:bg-surface-muted">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </Card>
    </SampleGate>
  );
}
