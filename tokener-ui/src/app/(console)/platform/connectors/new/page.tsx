"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConnectorWizard } from "@/components/platform/ConnectorWizard";
import { INTEGRATIONS } from "@/lib/mlops/catalog";
import { publishedById, useCatalogueState } from "@/lib/platform/connector-catalogue";
import { blankConnector } from "@/lib/platform/connector-publish";
import type { IntegrationDef } from "@/lib/mlops/types";

function Host() {
  const q = useSearchParams();
  const router = useRouter();
  const st = useCatalogueState();
  const edit = q.get("edit"), from = q.get("from"), draft = q.get("draft");

  const start = useMemo<{ def: IntegrationDef; editing: boolean } | null>(() => {
    if (!st) return null;
    if (edit) { const d = st.published[edit]; return d ? { def: structuredClone(d), editing: true } : null; }
    if (draft) { const d = st.drafts[draft]; return d ? { def: structuredClone(d.def), editing: !!st.published[draft] } : null; }
    if (from) {
      const src = st.published[from] ?? INTEGRATIONS.find((i) => i.id === from);
      if (!src) return null;
      const copy = structuredClone(src) as IntegrationDef;
      return { def: { ...copy, id: "", name: copy.name + " copy", published: undefined, status: "planned" }, editing: false };
    }
    return { def: blankConnector(), editing: false };
  }, [st, edit, from, draft]);

  if (!st) return null;
  if (!start) return <p className="text-sm text-text-secondary">That connector or draft was not found. <Link className="underline" href="/platform/connectors">Back to the catalogue</Link></p>;
  void publishedById;
  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-text-tertiary">
        <Link href="/platform/connectors" className="hover:text-text-primary">Connector catalogue</Link><ChevronRight size={13} /><span className="text-text-primary">{start.editing ? "Edit connector" : "Publish a connector"}</span>
      </nav>
      <PageHeader title={start.editing ? `Edit ${start.def.name}` : "Publish a connector"} description="Describe the connector, build its connection form, say what it can do, and write the contract that tells the platform how to talk to it. No backend release is needed." />
      <ConnectorWizard key={`${edit}${from}${draft}`} initial={start.def} editing={start.editing} onDone={() => router.push("/platform/connectors")} />
    </div>
  );
}

export default function NewConnectorPage() {
  return <Suspense fallback={null}><Host /></Suspense>;
}
