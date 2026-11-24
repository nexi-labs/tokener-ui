import { PageHeader } from "@/components/ui/PageHeader";
import { Studio } from "@/components/studio/Studio";

export const metadata = { title: "Request Trace" };

export default function Page() {
  return (
    <>
      <PageHeader title="Request Trace" description="Follow one request through every stage with timings, decisions and the attributes recorded at each hop." />
      <Studio mode="trace" />
    </>
  );
}
