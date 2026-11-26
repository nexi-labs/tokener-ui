import { SampleGate } from "@/components/gateway/SampleGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { Overview } from "@/components/dashboard/Overview";

const DESCRIPTION = "How the whole platform is doing: spend, the gateway, your agents, governance, models and data, with what needs you first.";

export default function DashboardPage() {
  return (
    <SampleGate title="Dashboard" description={DESCRIPTION}>
      <PageHeader title="Dashboard" description={DESCRIPTION} />
      <Overview />
    </SampleGate>
  );
}
