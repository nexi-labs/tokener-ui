import { PageHeader } from "@/components/ui/PageHeader";
import { Studio } from "@/components/studio/Studio";

export const metadata = { title: "Policy Studio" };

export default function Page() {
  return (
    <>
      <PageHeader title="Policy Studio" description="Build a policy by dragging rules onto a canvas. The Policy DSL, compiled Rego and API payload update live." />
      <Studio mode="policy" />
    </>
  );
}
