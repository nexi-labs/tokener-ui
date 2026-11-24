"use client";

import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { DemoTag, EnvBadge, GuardButton, Kpi, relTime, useRole } from "@/components/mlops/ui";
import { KbStatusBadge, compact, pct } from "@/components/mlops/KbBits";
import { useMlops } from "@/lib/mlops/store";
import { useRouter } from "next/navigation";

export default function KnowledgePage() {
  const s = useMlops()!;
  const role = useRole();
  const router = useRouter();
  const attention = s.knowledge.filter((k) => k.status === "degraded" || k.stats.staleDocuments > 0).length;
  const evals = s.knowledge.flatMap((k) => k.evalRuns[0] ? [k.evalRuns[0].recallAt5] : []);
  const avg = evals.length ? evals.reduce((a, b) => a + b, 0) / evals.length : null;
  return (
    <div className="space-y-5">
      <PageHeader title="Knowledge" description="The documents your assistants answer from. Each knowledge base has its sources, how they are split and embedded, who can query it, and a test set that tells you whether retrieval still works after a change."
        action={<GuardButton action="pipeline.publish" role={role} variant="primary" onClick={() => router.push("/mlops/knowledge/new")}><Plus size={15} /> New knowledge base</GuardButton>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Knowledge bases" value={s.knowledge.length} />
        <Kpi label="Indexed passages" value={compact(s.knowledge.reduce((a, k) => a + k.stats.chunks, 0))} />
        <Kpi label="Need attention" value={attention} tone={attention ? "warn" : undefined} sub="Failed sources or stale documents" />
        <Kpi label="Retrieval quality" value={avg === null ? "none yet" : pct(avg)} sub="Average recall at 5 from the latest tests" />
      </div>
      <Card>
        {s.knowledge.length === 0 ? <EmptyState icon={BookOpen} title="No knowledge bases" description="Create one from uploaded files or a bucket, then test retrieval before an assistant uses it." /> : (
          <Table>
            <Thead><tr><Th>Knowledge base</Th><Th>Status</Th><Th>Sources</Th><Th>Passages</Th><Th>Recall at 5</Th><Th>Embedding</Th><Th>Last sync</Th></tr></Thead>
            <tbody>
              {s.knowledge.map((k) => {
                const ev = k.evalRuns[0];
                return (
                  <Tr key={k.id}>
                    <Td><Link href={`/mlops/knowledge/${k.id}`} className="font-medium hover:underline">{k.name}</Link> {k.demo && <DemoTag />}<div className="mt-1"><EnvBadge env={k.env} /></div></Td>
                    <Td><KbStatusBadge s={k.status} />{k.stats.staleDocuments > 0 && <div className="text-xs text-[#9A5F05] mt-1">{k.stats.staleDocuments} stale</div>}</Td>
                    <Td className="tabular-nums">{k.sources.length}</Td>
                    <Td className="tabular-nums">{k.stats.chunks.toLocaleString()}<div className="text-xs text-text-tertiary whitespace-nowrap">{k.stats.documents} documents</div></Td>
                    <Td className="tabular-nums">{ev ? pct(ev.recallAt5) : <span className="text-text-tertiary">not tested</span>}</Td>
                    <Td className="text-text-secondary">{k.embedding.model}<div className="text-xs text-text-tertiary">{k.embedding.dimension} dimensions</div></Td>
                    <Td className="text-text-secondary">{k.stats.lastSyncAt ? relTime(k.stats.lastSyncAt) : "never"}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
