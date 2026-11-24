import { SampleGate } from "@/components/gateway/SampleGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Download, Clock } from "lucide-react";
import { SpendSparkline } from "@/components/dashboard/SpendSparkline";

export default function AnalyticsPage() {
  return (
    <SampleGate title="Analytics Explorer" description="Ad-hoc queries over token/cost analytics, filter, group, and chart by any dimension.">
      <PageHeader
        title="Analytics Explorer"
        description="Ad-hoc queries over token/cost analytics, filter, group, and chart by any dimension."
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary"><Clock size={14} /> Schedule report</Button>
            <Button variant="primary"><Download size={14} /> Export CSV</Button>
          </div>
        }
      />

      <Card className="mb-5">
        <div className="p-4 flex flex-wrap items-center gap-2 border-b border-border bg-surface-subtle rounded-t-lg">
          <FilterPill label="Tenant" value="All" />
          <FilterPill label="Project" value="All" />
          <FilterPill label="Model" value="All" />
          <FilterPill label="Provider" value="All" />
          <FilterPill label="Group by" value="Day" />
          <FilterPill label="Chart" value="Line" />
        </div>
        <CardHeader title="Spend over time" subtitle="Grouped by day, all tenants" />
        <div className="px-5 pb-5">
          <div className="h-56">
            <SpendSparkline />
          </div>
        </div>
      </Card>
    </SampleGate>
  );
}

function FilterPill({ label, value }: { label: string; value: string }) {
  return (
    <button className="h-8 px-3 rounded-md border border-border-strong bg-surface text-xs flex items-center gap-1.5 hover:bg-surface-muted transition-colors">
      <span className="text-text-tertiary">{label}:</span>
      <span className="text-text-primary font-medium">{value}</span>
    </button>
  );
}
