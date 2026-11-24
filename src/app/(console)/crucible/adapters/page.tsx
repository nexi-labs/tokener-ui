"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Notice } from "@/components/mlops/ui";
import { AdapterMark } from "@/components/crucible/bits";
import { useCrucible } from "@/lib/crucible/store";
import type { AdapterGroup } from "@/lib/crucible/types";

const GROUPS: { id: AdapterGroup; hint: string }[] = [
  { id: "Tracking", hint: "Use the MLflow client you already have, and bring history in." },
  { id: "Orchestration", hint: "Start Crucible jobs from the scheduler your teams use." },
  { id: "Cloud ML", hint: "Run on, register in or serve from a cloud ML service." },
  { id: "Compute", hint: "Where jobs run." },
  { id: "Data", hint: "Where training data comes from and how it is pinned." },
  { id: "Features", hint: "Online and offline features." },
  { id: "Models", hint: "Base models and where results are published." },
  { id: "Code", hint: "Pin the commit a run came from." },
  { id: "Artifacts", hint: "Where checkpoints and models are stored." },
  { id: "Serving", hint: "How a candidate is deployed." },
  { id: "Notebooks", hint: "Work from the tools people already use." },
];

export default function Adapters() {
  const { adapters } = useCrucible();
  const [q, setQ] = useState("");
  const shown = useMemo(() => adapters.filter((a) => !q || `${a.name} ${a.what} ${a.group}`.toLowerCase().includes(q.toLowerCase())), [adapters, q]);

  return (
    <div className="space-y-6">
      <PageHeader title="Adapters" description="Crucible works with the tools you already run. Each adapter is one way in or out: importing history, starting jobs, using someone else's compute, storing artifacts or deploying a candidate." />
      <Notice tone="info" title="None of these are released yet">Every adapter is planned or in development, and none has been run against the vendor's live service. This list is the plan, and the status on each card is the real state.</Notice>
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" aria-hidden />
        <Input aria-label="Search adapters" placeholder="Search adapters" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>
      {GROUPS.map((g) => {
        const list = shown.filter((a) => a.group === g.id);
        if (!list.length) return null;
        return (
          <section key={g.id} className="space-y-3">
            <div><h2 className="text-sm font-semibold text-text-primary">{g.id}</h2><p className="text-xs text-text-tertiary mt-0.5">{g.hint}</p></div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {list.map((a) => (
                <Card key={a.id} className="p-4 flex items-start gap-3">
                  <AdapterMark a={a} />
                  <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-text-primary truncate">{a.name}</span><Badge tone={a.status === "Available" ? "healthy" : a.status === "Beta" || a.status === "In development" ? "info" : "neutral"}>{a.status}</Badge></div><p className="text-xs text-text-secondary mt-1">{a.what}</p></div>
                </Card>
              ))}
            </div>
          </section>
        );
      })}
      {shown.length === 0 && <p className="text-sm text-text-secondary">No adapter matches that search.</p>}
    </div>
  );
}
