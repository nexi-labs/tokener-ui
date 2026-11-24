"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Lock, ScrollText } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { EmptyState } from "@/components/ui/EmptyState";
import { CodeBlock, Drawer, Loading, Notice, Toaster, fmtDate, relTime } from "@/components/mlops/ui";
import { toast } from "@/lib/mlops/toast";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useIamAdmin } from "@/lib/iam/useIamAdmin";
import { liveAudit, sampleAudit, type AuditEntry, type AuditFilter } from "@/lib/audit/client";
import { liveTenants, sampleTenantAdmin, type TenantSummary } from "@/lib/tenants/admin";

const SIZE = 20;
const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const startOf = (d: string) => (d ? `${d}T00:00:00.000Z` : undefined);
const endOf = (d: string) => (d ? `${d}T23:59:59.999Z` : undefined);
const pretty = (s: string | null) => { if (!s) return ""; try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; } };

export default function AuditPage() {
  const { orgId, sample } = useIamAdmin();
  const { status, isPlatform } = useAuth();
  const api = sample ? sampleAudit : liveAudit;
  const tenantApi = sample ? sampleTenantAdmin : liveTenants;
  const [tenants, setTenants] = useState<TenantSummary[] | null>(null);
  const [form, setForm] = useState({ tenantId: "", action: "", actorId: "", resourceType: "", from: "", to: "" });
  const [applied, setApplied] = useState<AuditFilter | null>(null);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<{ content: AuditEntry[]; totalElements: number; totalPages: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const [exporting, setExporting] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const toFilter = useCallback((f: typeof form): AuditFilter => ({ tenantId: f.tenantId || undefined, action: f.action, actorId: f.actorId, resourceType: f.resourceType, from: startOf(f.from), to: endOf(f.to) }), []);

  useEffect(() => {
    if (status !== "session" && status !== "demo") return;
    if (!orgId) { setTenants([]); return; }
    let live = true;
    tenantApi.list(orgId).then((t) => {
      if (!live) return;
      setTenants(t);
      // A person who is not a platform operator must name a tenant, so the first one is chosen for them.
      setForm((f) => { const next = { ...f, tenantId: f.tenantId || (isPlatform ? "" : t[0]?.id ?? "") }; setApplied((a) => a ?? toFilter(next)); return next; });
    }).catch((e) => { if (live) { setProblem(msg(e, "Tenants could not be loaded.")); setTenants([]); } });
    return () => { live = false; };
  }, [tenantApi, orgId, status, isPlatform, toFilter]);

  useEffect(() => {
    if (!applied) return;
    let live = true;
    setRows(null); setProblem(null);
    api.query(applied, page, SIZE).then((r) => { if (live) setRows(r); }).catch((e) => {
      if (!live) return;
      setProblem(e instanceof ApiError && e.status === 403 ? "Your role does not allow reading the audit log for this tenant." : msg(e, "The audit log could not be loaded."));
      setRows({ content: [], totalElements: 0, totalPages: 0 });
    });
    return () => { live = false; };
  }, [api, applied, page]);

  const tenantName = useMemo(() => Object.fromEntries((tenants ?? []).map((t) => [t.id, t.name])), [tenants]);
  const search = () => { setPage(0); setApplied(toFilter(form)); };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const f = toFilter(form);
      const blob = await api.exportCsv({ tenantId: f.tenantId, from: f.from, to: f.to });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "audit-export.csv"; a.click();
      URL.revokeObjectURL(url);
      toast("Evidence package downloaded", "success");
    } catch (e) { toast(msg(e, "The export failed."), "error"); }
    finally { setExporting(false); }
  };

  if (status === "loading") return <Loading />;
  const header = (
    <PageHeader
      title="Audit Explorer"
      description="Append-only trail of events published by platform modules, filtered by tenant, actor, action and time."
      action={<Button variant="primary" onClick={exportCsv} disabled={exporting || (!isPlatform && !form.tenantId)}><Download size={14} /> {exporting ? "Exporting" : "Export evidence package"}</Button>}
    />
  );
  if (!orgId) return <>{header}<Notice tone="info" title="No organization selected">This account is not part of an organization, so there is no audit log to read here.</Notice></>;

  return (
    <>
      {header}
      <Toaster />
      {sample && <div className="mb-4"><Notice tone="info" title="Sample audit log">These are sample entries. Nothing here comes from a real organization.</Notice></div>}
      {problem && <div className="mb-4"><Notice tone="bad" title="Could not load">{problem}</Notice></div>}
      <div className="mb-4"><Notice tone="info" title="What this log holds">It records events that other modules publish to the audit stream. Today that is budget breaches and provider changes (registered, disabled, credential rotated, health changed). Sign-in, user and role changes are kept in the identity trail, and pipeline actions in the MLOps trail; they do not appear here yet.</Notice></div>

      <Card>
        <div className="px-5 py-3 flex items-center gap-2 border-b border-border bg-surface-subtle rounded-t-lg text-xs text-text-secondary">
          <Lock size={13} /> Entries cannot be edited or deleted through the console or the API.
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-[1.7fr_1fr_1fr_1fr_1fr_1fr] gap-3 border-b border-border items-end">
          <Field label="Tenant">
            <Select value={form.tenantId} onChange={set("tenantId")}>
              {isPlatform && <option value="">All tenants</option>}
              {(tenants ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Action"><Input value={form.action} onChange={set("action")} placeholder="BudgetBreachEvent" /></Field>
          <Field label="Actor"><Input value={form.actorId} onChange={set("actorId")} placeholder="system" /></Field>
          <Field label="Resource type"><Input value={form.resourceType} onChange={set("resourceType")} placeholder="project" /></Field>
          <Field label="From"><Input type="date" value={form.from} onChange={set("from")} /></Field>
          <Field label="To"><Input type="date" value={form.to} onChange={set("to")} /></Field>
          <div className="md:col-span-3 xl:col-span-6"><Button variant="secondary" onClick={search}>Apply filters</Button></div>
        </div>

        {rows === null ? <div className="p-6"><Loading /></div> : rows.content.length === 0 ? (
          <EmptyState icon={ScrollText} title="No entries match" description="Nothing has been recorded for these filters. Widen the date range or clear a filter." />
        ) : (
          <Table>
            <Thead><tr><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Resource</Th>{isPlatform && !form.tenantId && <Th>Tenant</Th>}</tr></Thead>
            <tbody>
              {rows.content.map((e) => (
                <Tr key={e.id} onClick={() => setOpen(e)} className="cursor-pointer">
                  <Td className="text-text-secondary whitespace-nowrap" ><span title={fmtDate(e.occurredAt)}>{relTime(e.occurredAt)}</span></Td>
                  <Td>{e.actorId ?? <span className="text-text-tertiary">Unknown</span>}</Td>
                  <Td><span className="font-mono text-xs px-1.5 py-0.5 rounded bg-surface-muted">{e.action}</span></Td>
                  <Td className="font-mono text-xs text-text-secondary">{e.resourceType ?? ""}{e.resourceId ? ` · ${e.resourceId}` : ""}</Td>
                  {isPlatform && !form.tenantId && <Td className="text-text-secondary">{e.tenantId ? tenantName[e.tenantId] ?? e.tenantId.slice(0, 8) : "Platform"}</Td>}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {rows && rows.totalElements > 0 && (
          <div className="px-5 py-3 flex items-center justify-between text-xs text-text-secondary">
            <span>{rows.totalElements.toLocaleString("en-US")} {rows.totalElements === 1 ? "entry" : "entries"}</span>
            <div className="flex items-center gap-2">
              <button className="p-1 rounded hover:bg-surface-muted disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
              <span className="tabular-nums">Page {page + 1} of {Math.max(1, rows.totalPages)}</span>
              <button className="p-1 rounded hover:bg-surface-muted disabled:opacity-40" disabled={page + 1 >= rows.totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </Card>

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.action ?? ""} subtitle={open ? fmtDate(open.occurredAt) : undefined}>
        {open && (
          <div className="space-y-4">
            <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-[13px]">
              <dt className="text-text-tertiary">Actor</dt><dd>{open.actorId ?? "Unknown"}</dd>
              <dt className="text-text-tertiary">Tenant</dt><dd>{open.tenantId ? tenantName[open.tenantId] ?? open.tenantId : "Platform"}</dd>
              <dt className="text-text-tertiary">Resource</dt><dd className="font-mono text-xs">{open.resourceType ?? ""}{open.resourceId ? ` · ${open.resourceId}` : ""}</dd>
              <dt className="text-text-tertiary">Entry ID</dt><dd className="font-mono text-xs break-all">{open.id}</dd>
            </dl>
            {open.beforeState && <CodeBlock code={pretty(open.beforeState)} language="json" title="Before" maxHeight={220} />}
            {open.afterState && <CodeBlock code={pretty(open.afterState)} language="json" title="After" maxHeight={220} />}
            {!open.beforeState && !open.afterState && <p className="text-xs text-text-tertiary">This entry carries no before or after state.</p>}
          </div>
        )}
      </Drawer>
    </>
  );
}
