import { SampleGate } from "@/components/gateway/SampleGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SimpleIcon } from "@/components/icons/SimpleIcon";
import { siKubernetes, siApachekafka, siApacheflink, siPostgresql, siRedis } from "simple-icons";

const COMPONENTS = [
  { name: "Kubernetes", icon: siKubernetes, detail: "3 regions · 84 pods", status: "healthy" as const },
  { name: "Kafka", icon: siApachekafka, detail: "12 brokers · RF 3", status: "healthy" as const },
  { name: "Flink", icon: siApacheflink, detail: "6 jobs running", status: "degraded" as const },
  { name: "PostgreSQL", icon: siPostgresql, detail: "Primary + 2 replicas", status: "healthy" as const },
  { name: "Redis", icon: siRedis, detail: "Cluster · 6 shards", status: "healthy" as const },
];

export default function ClusterPage() {
  return (
    <SampleGate title="Cluster Management" description="Infrastructure health across the Kubernetes, Kafka, and Flink footprint.">
      <PageHeader title="Cluster Management" description="Infrastructure health across the Kubernetes, Kafka, and Flink footprint." />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {COMPONENTS.map((c) => (
          <Card key={c.name} className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-surface-muted flex items-center justify-center">
                <SimpleIcon icon={c.icon} size={19} monochrome={false} />
              </div>
              <div>
                <div className="text-sm font-medium text-text-primary">{c.name}</div>
                <div className="text-xs text-text-tertiary">{c.detail}</div>
              </div>
            </div>
            <Badge tone={c.status}>{c.status}</Badge>
          </Card>
        ))}
      </div>
    </SampleGate>
  );
}
