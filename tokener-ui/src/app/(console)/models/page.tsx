import { SampleGate } from "@/components/gateway/SampleGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Plus } from "lucide-react";
import Link from "next/link";

const MODELS = [
  { name: "claude-sonnet-5", family: "claude", capabilities: ["chat", "vision", "tools", "reasoning"], context: "200K", price: "$3.00 / $15.00" },
  { name: "gpt-5", family: "gpt", capabilities: ["chat", "vision", "tools"], context: "256K", price: "$2.50 / $10.00" },
  { name: "gemini-2-5-pro", family: "gemini", capabilities: ["chat", "vision"], context: "1M", price: "$1.25 / $5.00" },
  { name: "llama-3-70b", family: "self-hosted", capabilities: ["chat"], context: "128K", price: "compute only" },
];

const ALIASES = [
  { alias: "default-chat", chain: "claude-sonnet-5 → gpt-5 → llama-3-70b" },
  { alias: "fast-reasoning", chain: "claude-sonnet-5 → gemini-2-5-pro" },
  { alias: "cheap-embeddings", chain: "text-embedding-3-small" },
];

export default function ModelsPage() {
  return (
    <SampleGate title="Model Registry" description="Canonical model catalog, capability flags, pricing history, and alias resolution.">
      <PageHeader
        title="Model Registry"
        description="Canonical model catalog, capability flags, pricing history, and alias resolution."
        action={
          <Button variant="primary">
            <Plus size={15} /> Register model
          </Button>
        }
      />

      <Card className="mb-5">
        <Table>
          <Thead>
            <tr>
              <Th>Model</Th>
              <Th>Family</Th>
              <Th>Capabilities</Th>
              <Th>Context window</Th>
              <Th>Price (in / out per 1M)</Th>
            </tr>
          </Thead>
          <tbody>
            {MODELS.map((m) => (
              <Tr key={m.name}>
                <Td><Link href={`/models/${m.name}`} className="font-mono font-medium hover:underline">{m.name}</Link></Td>
                <Td><Badge tone="neutral">{m.family}</Badge></Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {m.capabilities.map((c) => (
                      <span key={c} className="text-[11px] px-1.5 py-0.5 rounded bg-surface-muted text-text-secondary">{c}</span>
                    ))}
                  </div>
                </Td>
                <Td className="tabular-nums">{m.context}</Td>
                <Td className="tabular-nums">{m.price}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-[13px] font-semibold text-text-primary">Alias resolution</h3>
          <p className="text-xs text-text-tertiary mt-0.5">
            Provider-agnostic names the Gateway resolves to a concrete (Provider, Model) pair at request time.
          </p>
        </div>
        <div className="divide-y divide-border">
          {ALIASES.map((a) => (
            <div key={a.alias} className="flex items-center justify-between px-5 py-3">
              <span className="font-mono text-sm font-medium text-text-primary">{a.alias}</span>
              <span className="text-xs text-text-tertiary font-mono">{a.chain}</span>
            </div>
          ))}
        </div>
      </Card>
    </SampleGate>
  );
}
