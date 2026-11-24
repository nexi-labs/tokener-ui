import { SampleGate } from "@/components/gateway/SampleGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TrendingUp, TrendingDown } from "lucide-react";
import { SpendSparkline } from "@/components/dashboard/SpendSparkline";
import { siOpenai, siAnthropic, siGooglegemini, siAmazon } from "simple-icons";
import { SimpleIcon } from "@/components/icons/SimpleIcon";

const PROVIDERS = [
  { name: "OpenAI", icon: siOpenai, status: "healthy" as const, p99: "412ms" },
  { name: "Anthropic", icon: siAnthropic, status: "healthy" as const, p99: "388ms" },
  { name: "Gemini", icon: siGooglegemini, status: "degraded" as const, p99: "1.2s" },
  { name: "Bedrock", icon: siAmazon, status: "healthy" as const, p99: "455ms" },
];

const TOP_MODELS = [
  { model: "claude-sonnet-5", spend: "$18,240", requests: "1.2M" },
  { model: "gpt-5", spend: "$14,905", requests: "890K" },
  { model: "gemini-2-5-pro", spend: "$6,310", requests: "410K" },
  { model: "llama-3-70b (self-hosted)", spend: "$0", requests: "205K" },
];

const TOP_TENANTS = [
  { tenant: "prod", spend: "$24,110", trend: "up" as const },
  { tenant: "staging", spend: "$3,402", trend: "down" as const },
  { tenant: "recsys-eu", spend: "$8,880", trend: "up" as const },
];

export default function DashboardPage() {
  return (
    <SampleGate title="Dashboard" description="Live spend, token throughput, and provider health across every tenant.">
      <PageHeader
        title="Dashboard"
        description="Live spend, token throughput, and provider health across every tenant."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <Card className="lg:col-span-2">
          <CardHeader title="AI Spend" subtitle="Current billing period vs. budget" />
          <CardBody>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-3xl font-semibold tabular-nums text-text-primary">$42,304</div>
                <div className="flex items-center gap-1.5 mt-1.5 text-sm">
                  <TrendingUp size={14} className="text-status-down" />
                  <span className="text-status-down font-medium">+12.4%</span>
                  <span className="text-text-tertiary">vs. last period</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-text-secondary">of $60,000 budget</div>
                <div className="w-40 h-1.5 rounded-full bg-surface-muted mt-2 overflow-hidden">
                  <div className="h-full bg-accent-500 rounded-full" style={{ width: "70%" }} />
                </div>
              </div>
            </div>
            <SpendSparkline />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Live Token Consumption" subtitle="Real-time, tokens/sec" />
          <CardBody className="flex flex-col items-center justify-center py-8">
            <div className="text-4xl font-semibold tabular-nums text-text-primary">8,214</div>
            <div className="text-sm text-text-tertiary mt-1">tokens / sec</div>
            <div className="flex items-center gap-1.5 mt-3">
              <span className="h-1.5 w-1.5 rounded-full bg-status-healthy animate-pulse" />
              <span className="text-xs text-text-secondary">Live</span>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <Card>
          <CardHeader title="Provider Health" />
          <div className="divide-y divide-border">
            {PROVIDERS.map((p) => (
              <div key={p.name} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <SimpleIcon icon={p.icon} size={16} className="text-text-secondary" />
                  <span className="text-sm text-text-primary">{p.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-tertiary tabular-nums">{p.p99}</span>
                  <Badge tone={p.status}>{p.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Active Requests" subtitle="Live, by tenant" />
          <CardBody className="flex flex-col items-center justify-center py-8">
            <div className="text-4xl font-semibold tabular-nums text-text-primary">312</div>
            <div className="text-sm text-text-tertiary mt-1">in-flight requests</div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Budget Burn Rate" subtitle="Projected exhaustion, soonest first" />
          <div className="divide-y divide-border">
            {[
              { scope: "project:recsys", date: "Sep 3", tone: "down" as const },
              { scope: "tenant:staging", date: "Sep 21", tone: "degraded" as const },
              { scope: "tenant:prod", date: "Oct 30", tone: "healthy" as const },
            ].map((row) => (
              <div key={row.scope} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-text-primary font-mono">{row.scope}</span>
                <Badge tone={row.tone}>{row.date}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Top Models" subtitle="Ranked by spend" />
          <div className="divide-y divide-border">
            {TOP_MODELS.map((m) => (
              <div key={m.model} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-text-primary font-mono">{m.model}</span>
                <div className="text-right">
                  <div className="text-sm font-medium text-text-primary tabular-nums">{m.spend}</div>
                  <div className="text-xs text-text-tertiary tabular-nums">{m.requests} req</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Top Tenants" subtitle="Ranked by spend" />
          <div className="divide-y divide-border">
            {TOP_TENANTS.map((t) => (
              <div key={t.tenant} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-text-primary">{t.tenant}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary tabular-nums">{t.spend}</span>
                  {t.trend === "up" ? (
                    <TrendingUp size={14} className="text-status-down" />
                  ) : (
                    <TrendingDown size={14} className="text-status-healthy" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </SampleGate>
  );
}
