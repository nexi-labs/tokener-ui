import { SampleGate } from "@/components/gateway/SampleGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function SettingsPage() {
  return (
    <SampleGate title="System Settings" description="Org-wide configuration and platform defaults.">
      <PageHeader title="System Settings" description="Org-wide configuration and platform defaults." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Gateway fail-mode defaults" subtitle="Per-tenant overridable" />
          <CardBody className="flex flex-col gap-4">
            <SettingRow label="Policy Engine unreachable" value="fail-open" />
            <SettingRow label="Budget Engine unreachable" value="fail-closed" />
            <SettingRow label="Provider timeout" value="30,000 ms" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Cache TTLs" />
          <CardBody className="flex flex-col gap-4">
            <SettingRow label="Policy bundle" value="5,000 ms" />
            <SettingRow label="Model alias resolution" value="30,000 ms" />
            <SettingRow label="Provider health" value="2,000 ms" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Sign-in methods" subtitle="Google, GitHub, email and password" />
          <CardBody className="flex flex-col gap-4">
            <SettingRow label="Google" value="Enabled" />
            <SettingRow label="GitHub" value="Enabled" />
            <SettingRow label="Email and password" value="Enabled, minimum 12 characters" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Data residency" />
          <CardBody className="flex flex-col gap-4">
            <SettingRow label="Home region" value="us-east-1" />
            <SettingRow label="Cross-region fallback" value="disabled for eu-prod" />
          </CardBody>
        </Card>
      </div>

      <div className="flex justify-end mt-5">
        <Button variant="primary">Save changes</Button>
      </div>
    </SampleGate>
  );
}

function SettingRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className={`text-sm font-medium text-text-primary ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
