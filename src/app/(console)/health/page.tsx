import { SampleGate } from "@/components/gateway/SampleGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const SERVICES = [
  { name: "AI Gateway", replicas: "8/8", status: "healthy" as const },
  { name: "Policy Engine", replicas: "3/3", status: "healthy" as const },
  { name: "Budget Engine", replicas: "3/3", status: "healthy" as const },
  { name: "Token Accounting", replicas: "4/4", status: "healthy" as const },
  { name: "Cost Engine", replicas: "3/3", status: "healthy" as const },
  { name: "Document Processing", replicas: "2/3", status: "degraded" as const },
  { name: "Notification", replicas: "2/2", status: "healthy" as const },
  { name: "Billing", replicas: "2/2", status: "healthy" as const },
];

export default function HealthPage() {
  return (
    <SampleGate title="Platform Health" description="Liveness/readiness across every module, with deep links to Prometheus and Grafana.">
      <PageHeader title="Platform Health" description="Liveness/readiness across every module, with deep links to Prometheus and Grafana." />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {SERVICES.map((s) => (
          <Card key={s.name} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-text-primary">{s.name}</span>
              <Badge tone={s.status}>{s.status}</Badge>
            </div>
            <div className="text-xs text-text-tertiary tabular-nums">{s.replicas} replicas ready</div>
          </Card>
        ))}
      </div>
    </SampleGate>
  );
}
