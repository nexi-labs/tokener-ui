"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ScrollText, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Notice } from "@/components/mlops/ui";
import { Pager } from "@/components/refinery/Pager";
import { ago, useRefineryRole } from "@/components/refinery/bits";
import { refinery } from "@/lib/refinery/store";
import { toast } from "@/lib/mlops/toast";
import type { AuditEntry, AuditFilter } from "@/lib/refinery/types";

/** What each recorded action reads as. An action not listed shows as recorded. */
const PHRASE: Record<string, string> = {
  "refinery.connection.create": "Created a connection", "refinery.connection.delete": "Deleted a connection", "refinery.connection.rotate": "Rotated connection credentials", "refinery.connection.test": "Tested a connection",
  "refinery.dataset.upload": "Uploaded a file", "refinery.dataset.register": "Registered a dataset", "refinery.dataset.update": "Changed a dataset", "refinery.dataset.delete": "Deleted a dataset", "refinery.dataset.restore": "Restored a dataset version",
  "refinery.model.create": "Built a unified dataset", "refinery.model.update": "Changed a unified dataset",
  "refinery.recipe.create": "Created a recipe", "refinery.recipe.update": "Changed a recipe", "refinery.recipe.delete": "Deleted a recipe",
  "refinery.run.start": "Started a run", "refinery.run.cancel": "Cancelled a run", "refinery.run.refused": "A run was refused by the data location policy",
  "refinery.setting.put": "Saved a setting", "refinery.setting.delete": "Removed a setting",
  "refinery.schedule.put": "Set a schedule", "refinery.schedule.delete": "Removed a schedule", "refinery.schedule.failed": "A scheduled start was refused",
  "refinery.pool.create": "Created a runner pool", "refinery.pool.enroll": "A runner enrolled", "refinery.pool.reenroll": "Issued a new enrollment token", "refinery.pool.resize": "Changed a pool's capacity", "refinery.pool.delete": "Removed a runner pool",
  "refinery.stream.create": "Created a stream", "refinery.stream.delete": "Removed a stream", "refinery.native_limits.update": "Changed the native engine limits",
};
const GROUPS: [string, string][] = [["", "Any action"], ["refinery.connection", "Connections"], ["refinery.dataset", "Datasets"], ["refinery.model", "Unified datasets"], ["refinery.recipe", "Recipes"], ["refinery.run", "Runs"], ["refinery.schedule", "Schedules"], ["refinery.pool", "Runner pools"], ["refinery.stream", "Streams"], ["refinery.setting", "Settings"], ["refinery.native_limits", "Native engine limits"]];
const SIZES = [25, 50, 100] as const;

const phrase = (a: string) => PHRASE[a] ?? a.replace(/^refinery\./, "").replace(/[._]/g, " ");
const summary = (d: Record<string, unknown>) => {
  const why = typeof d.why === "string" ? d.why : "";
  const rest = Object.entries(d).filter(([k, v]) => k !== "why" && !(why && k === "reason") && v !== null && typeof v !== "object").slice(0, 4).map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").toLowerCase()} ${String(v)}`).join(", ");
  return [why, rest].filter(Boolean).join(" ");
};

export default function ActivityPage() {
  const role = useRefineryRole();
  const [f, setF] = useState<AuditFilter>({});
  const [applied, setApplied] = useState<AuditFilter>({});
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<number>(50);
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    const r = await refinery.auditPage(applied, page, size);
    if (mine !== seq.current) return;
    if (!r.ok) { setErr(r.error); return; }
    setErr(null); setRows(r.entries); setTotal(r.total); setPages(r.pages);
  }, [applied, page, size]);
  useEffect(() => { void load(); }, [load]);

  const apply = () => { setPage(0); setApplied({ ...f }); };
  const clear = () => { setF({}); setPage(0); setApplied({}); };
  const exportCsv = async () => {
    setBusy(true); const r = await refinery.auditCsv(applied); setBusy(false);
    if (!r.ok) { toast(r.error, "error"); return; }
    const url = URL.createObjectURL(r.blob); const a = document.createElement("a"); a.href = url; a.download = `refinery-activity-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (role !== "admin") return <Notice tone="info" title="Only admins read the activity trail">The trail records who changed what, so it is limited to the admin role. You are signed in as {role}.</Notice>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Activity</h2>
          <p className="text-sm text-text-secondary mt-1 max-w-2xl">Every change made in Refinery, with who made it and when. Entries are written once and cannot be edited or removed.</p>
        </div>
        <Button variant="secondary" onClick={exportCsv} disabled={busy || total === 0}><Download size={15} /> Export CSV</Button>
      </div>

      <Card>
        <form className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); apply(); }}>
          <label className="relative block"><span className="sr-only">Search</span><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" /><Input className="pl-9" placeholder="Search name, file or target" value={f.q ?? ""} onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
          <Select aria-label="Action" value={f.action ?? ""} onChange={(e) => setF({ ...f, action: e.target.value })}>{GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          <Input aria-label="Person" placeholder="Person (email)" value={f.actor ?? ""} onChange={(e) => setF({ ...f, actor: e.target.value })} />
          <Input aria-label="From" type="date" value={f.from ?? ""} onChange={(e) => setF({ ...f, from: e.target.value })} />
          <Input aria-label="To" type="date" value={f.to ?? ""} onChange={(e) => setF({ ...f, to: e.target.value })} />
          <div className="flex gap-2"><Button type="submit" variant="primary">Apply</Button><Button type="button" variant="secondary" onClick={clear}>Clear</Button></div>
        </form>
      </Card>

      {err && <Notice tone="bad" title="The activity trail could not be loaded">{err}</Notice>}

      <Card>
        <Table>
          <Thead><tr><Th>When</Th><Th>Who</Th><Th>What</Th><Th>Target</Th><Th>Details</Th></tr></Thead>
          <tbody>
            {(rows ?? []).map((e) => (
              <Tr key={e.seq}>
                <Td className="text-[13px] whitespace-nowrap">{ago(e.at)}<div className="text-[11px] text-text-tertiary">{new Date(e.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div></Td>
                <Td className="text-[13px]">{e.actor}</Td>
                <Td className="text-[13px]"><div className="font-medium">{phrase(e.action)}</div><div className="text-[11px] text-text-tertiary font-mono">{e.action}</div></Td>
                <Td className="text-[13px]">{e.targetType}<div className="text-[11px] text-text-tertiary font-mono break-all">{e.targetId}</div></Td>
                <Td className="text-[13px] text-text-secondary max-w-sm">{summary(e.detail) || ""}</Td>
              </Tr>
            ))}
            {rows && rows.length === 0 && <Tr><Td colSpan={5} className="text-center text-text-secondary py-12"><ScrollText size={20} className="mx-auto mb-2 text-text-tertiary" />Nothing matches these filters.</Td></Tr>}
            {!rows && !err && <Tr><Td colSpan={5} className="text-center text-text-secondary py-12">Loading the trail.</Td></Tr>}
          </tbody>
        </Table>
        <Pager page={page} pages={pages} size={size} total={total} onPage={setPage} onSize={(s) => { setSize(s); setPage(0); }} sizes={SIZES} />
      </Card>
    </div>
  );
}
