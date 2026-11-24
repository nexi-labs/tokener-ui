import { SampleGate } from "@/components/gateway/SampleGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";

const FLAGS = [
  { key: "flink-anomaly-detection", enabled: false, rollout: "0%", description: "ML-based anomaly detection " },
  { key: "visual-policy-builder", enabled: true, rollout: "100%", description: "Form-based Policy Builder UI" },
  { key: "byok-credentials", enabled: true, rollout: "35%", description: "Bring Your Own Key provider credentials" },
  { key: "multi-region-active-write", enabled: false, rollout: "0%", description: "Active-active write path " },
];

export default function FeatureFlagsPage() {
  return (
    <SampleGate title="Feature Flags" description="Cluster-wide rollout controls for in-progress capabilities.">
      <PageHeader title="Feature Flags" description="Cluster-wide rollout controls for in-progress capabilities." />

      <Card>
        <div className="divide-y divide-border">
          {FLAGS.map((f) => (
            <div key={f.key} className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="font-mono text-sm font-medium text-text-primary">{f.key}</div>
                <div className="text-xs text-text-tertiary mt-0.5">{f.description}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-tertiary tabular-nums">{f.rollout}</span>
                <Toggle enabled={f.enabled} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </SampleGate>
  );
}

function Toggle({ enabled }: { enabled: boolean }) {
  return (
    <div className={`h-5 w-9 rounded-full flex items-center px-0.5 transition-colors ${enabled ? "bg-accent-500 justify-end" : "bg-surface-muted justify-start"}`}>
      <div className="h-4 w-4 rounded-full bg-surface shadow-sm" />
    </div>
  );
}
