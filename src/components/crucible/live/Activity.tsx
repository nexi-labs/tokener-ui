"use client";

import { useState } from "react";
import { ScrollText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Notice } from "@/components/mlops/ui";
import { crucibleDriver, useCrucibleCan } from "@/lib/crucible/live/store";
import { person, when } from "./bits";
import { useRead } from "./hooks";

const SIZE = 25;
export function LiveActivity() {
  const can = useCrucibleCan();
  const [q, setQ] = useState(""); const [applied, setApplied] = useState(""); const [actor, setActor] = useState(""); const [actorApplied, setActorApplied] = useState(""); const [page, setPage] = useState(0);
  const { data, error, loading } = useRead(() => crucibleDriver().audit({ q: applied || undefined, actor: actorApplied || undefined, page, size: SIZE }), [applied, actorApplied, page]);
  const p = data?.page;
  if (!can("settings")) return <Card><EmptyState icon={ScrollText} title="Only an admin can read the activity trail" description="It records who changed what in Crucible. Ask an admin of your organisation." /></Card>;
  return (
    <div className="space-y-5">
      <PageHeader title="Activity" description="Every change made in Crucible, newest first. Entries cannot be edited or removed." />
      <form onSubmit={(e) => { e.preventDefault(); setPage(0); setApplied(q.trim()); setActorApplied(actor.trim()); }} className="flex flex-wrap items-center gap-2">
        <Input aria-label="Search the activity" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, for example key.issue or a project id" className="flex-1 min-w-[240px]" />
        <Input aria-label="Actor" value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Who, by email" className="w-56" />
        <Button variant="secondary" type="submit">Apply</Button>
      </form>
      {error && <Notice tone="bad" title="Could not load the activity">{error}</Notice>}
      {!error && !loading && p && p.content.length === 0 ? <Card><EmptyState icon={ScrollText} title="Nothing matches" description="No change has been recorded for this search yet." /></Card> : p && (
        <Card className="overflow-hidden"><Table>
          <Thead><tr><Th>When</Th><Th>Who</Th><Th>What</Th><Th>On</Th><Th>Detail</Th></tr></Thead>
          <tbody>{p.content.map((a) => <Tr key={a.seq}>
            <Td className="whitespace-nowrap text-text-secondary">{when(a.at)}</Td><Td>{person(a.actor)}</Td>
            <Td className="font-code text-xs">{a.action}</Td><Td className="text-text-secondary"><span className="text-xs text-text-tertiary">{a.targetType}</span><div className="font-code text-xs break-all">{a.targetId}</div></Td>
            <Td className="text-text-secondary font-code text-xs max-w-[320px] break-all">{Object.entries(a.detail).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(", ")}</Td>
          </Tr>)}</tbody>
        </Table></Card>
      )}
      {p && p.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-text-secondary">
          <span>{p.totalElements} entries · page {p.page + 1} of {p.totalPages}</span>
          <div className="flex gap-2"><Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</Button><Button variant="secondary" disabled={page + 1 >= p.totalPages} onClick={() => setPage(page + 1)}>Older</Button></div>
        </div>
      )}
    </div>
  );
}
