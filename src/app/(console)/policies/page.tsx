import { SampleGate } from "@/components/gateway/SampleGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Plus, Play, History, Layers } from "lucide-react";
import Link from "next/link";

const POLICIES = [
  { name: "default-prod-policy", scope: "tenant:prod", version: 4, enforce: false, active: true },
  { name: "eu-data-residency", scope: "tenant:eu-prod", version: 2, enforce: true, active: true },
  { name: "intern-sandbox", scope: "project:intern-experiments", version: 1, enforce: false, active: true },
];

const SAMPLE_DSL = `POLICY "default-prod-policy" SCOPE tenant:prod
  ALLOW MODEL gpt-5, claude-sonnet-5, gemini-2-5-pro
  DENY MODEL *-preview
  LIMIT TOKENS 100000 PER user PER day
  LIMIT COST 50 USD PER project PER day
  ALLOW HOURS 08:00-18:00 TIMEZONE "Asia/Bahrain"
  DENY IMAGE
  ON BREACH THROTTLE`;

export default function PoliciesPage() {
  return (
    <SampleGate title="Policy Builder" description="Versioned, tenant-scoped policy documents evaluated before every request.">
      <PageHeader
        title="Policy Builder"
        description="Versioned, tenant-scoped policy documents evaluated before every request."
        action={
          <div className="flex items-center gap-2">
            <Link href="/policy-studio" className="inline-flex items-center gap-2 h-9 px-3.5 rounded-md border border-border-strong text-sm font-medium hover:bg-surface-subtle">
              <Layers size={15} /> Open in Studio
            </Link>
            <Button variant="primary">
              <Plus size={15} /> New policy
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <Card className="xl:col-span-2">
          <CardHeader title="Active policies" />
          <div className="divide-y divide-border">
            {POLICIES.map((p) => (
              <button key={p.name} className="w-full text-left px-5 py-3.5 hover:bg-surface-subtle transition-colors">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-medium text-text-primary">{p.name}</span>
                  {p.enforce && <Badge tone="degraded">enforce</Badge>}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-text-tertiary">
                  <span className="font-mono">{p.scope}</span>
                  <span>&middot;</span>
                  <span>v{p.version}</span>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader
            title="default-prod-policy"
            subtitle="tenant:prod, version 4"
            action={
              <div className="flex items-center gap-2">
                <Button variant="ghost"><History size={14} /> Version history</Button>
                <Button variant="secondary"><Play size={14} /> Simulate</Button>
              </div>
            }
          />
          <div className="px-5 py-4">
            <pre className="bg-ink-800 text-text-inverse rounded-md p-4 text-[13px] leading-relaxed font-mono overflow-x-auto">
{SAMPLE_DSL}
            </pre>
          </div>

          <div className="px-5 pb-5">
            <div className="border border-border rounded-md">
              <div className="px-4 py-2.5 border-b border-border bg-surface-subtle rounded-t-md">
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Simulation panel</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-text-secondary">Model</span>
                  <input className="h-9 rounded-md border border-border-strong px-2.5 text-sm font-mono" defaultValue="claude-sonnet-5" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-text-secondary">Capability</span>
                  <input className="h-9 rounded-md border border-border-strong px-2.5 text-sm" defaultValue="chat" />
                </label>
              </div>
              <div className="px-4 pb-4">
                <div className="rounded-md bg-status-healthy/10 border border-status-healthy/20 px-3.5 py-2.5 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-status-healthy" />
                  <span className="text-sm text-text-primary font-medium">Allowed</span>
                  <span className="text-xs text-text-secondary">matches ALLOW MODEL rule, within allowed hours</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </SampleGate>
  );
}
