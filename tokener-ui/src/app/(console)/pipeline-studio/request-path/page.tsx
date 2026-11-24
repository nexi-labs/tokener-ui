import { PageHeader } from "@/components/ui/PageHeader";
import { Studio } from "@/components/studio/Studio";

export const metadata = { title: "Request path | Pipeline Studio" };

export default function Page() {
  return (
    <>
      <PageHeader title="Request path" description="Design the path every gateway call travels through, then simulate allowed, denied, over-budget and failover requests." />
      <Studio mode="pipeline" />
    </>
  );
}
