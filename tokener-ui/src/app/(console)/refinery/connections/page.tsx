"use client";

import { useEffect, useState } from "react";
import { Check, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Card } from "@/components/ui/Card";
import { Confirm, Drawer, KeyValue, Notice } from "@/components/mlops/ui";
import { ConnStateBadge, ConnectorMark, ago } from "@/components/refinery/bits";
import { ConnectionWizard } from "@/components/refinery/ConnectionWizard";
import { CONNECTOR_BY_ID } from "@/lib/refinery/connectors";
import { refinery, useRefinery, useRefineryStatus } from "@/lib/refinery/store";
import { Input } from "@/components/ui/Form";
import { toast } from "@/lib/mlops/toast";
import type { Connection } from "@/lib/refinery/types";

/** Replaces one secret. The new value goes straight to the secret store and is never shown again. */
function RotateSecret({ connectionId, secretKey, label }: { connectionId: string; secretKey: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return <Button onClick={() => setOpen(true)}>Rotate</Button>;
  const save = async () => {
    setBusy(true); const r = await refinery.rotateConnectionSecret(connectionId, secretKey, value); setBusy(false);
    if (!r.ok) { toast(r.error ?? "That did not work", "error"); return; }
    toast(`${label} replaced. Test the connection to confirm it works.`); setValue(""); setOpen(false);
  };
  return (
    <div className="flex items-center gap-2">
      <Input type="password" autoComplete="off" aria-label={`New value for ${label}`} placeholder="New value" value={value} onChange={(e) => setValue(e.target.value)} />
      <Button variant="primary" disabled={busy || !value} onClick={save}>Replace</Button>
      <Button disabled={busy} onClick={() => { setValue(""); setOpen(false); }}>Cancel</Button>
    </div>
  );
}

export default function ConnectionsPage() {
  const { connections, datasets } = useRefinery();
  const isLive = useRefineryStatus().mode === "live";
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [del, setDel] = useState<Connection | null>(null);
  const [last, setLast] = useState<{ id: string; steps: { name: string; ok: boolean; detail: string }[] } | null>(null);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("add")) setOpen(true); }, []);
  const conn = connections.find((c) => c.id === sel) ?? null;
  const spec = conn ? CONNECTOR_BY_ID.get(conn.connector) : null;
  const method = spec?.auth.find((a) => a.id === conn?.auth);
  const used = (id: string) => datasets.filter((d) => (d.source.kind === "connection" || d.source.kind === "query") && d.source.connectionId === id).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div><h2 className="text-lg font-semibold tracking-tight">Connections</h2><p className="text-sm text-text-secondary mt-1 max-w-2xl">How Refinery reaches your systems and signs in to them. Secrets are kept in your secret manager. A connection holds only a reference to each.</p></div>
        <Button variant="primary" onClick={() => setOpen(true)}><Plus size={15} /> New connection</Button>
      </div>

      <Card>
        <Table>
          <Thead><tr><Th>Connection</Th><Th>Sign in</Th><Th>Runs on</Th><Th>Status</Th><Th>Used by</Th></tr></Thead>
          <tbody>
            {connections.map((c) => {
              const k = CONNECTOR_BY_ID.get(c.connector); const m = k?.auth.find((a) => a.id === c.auth);
              return (
                <Tr key={c.id} className="cursor-pointer" onClick={() => setSel(c.id)}>
                  <Td><div className="flex items-center gap-3"><ConnectorMark id={c.connector} /><div className="min-w-0"><button className="font-medium text-left hover:underline" onClick={() => setSel(c.id)}>{c.name}</button><div className="text-xs text-text-tertiary">{k?.name}</div></div></div></Td>
                  <Td className="text-[13px]">{m?.label}</Td>
                  <Td className="text-[13px]">{c.pool}</Td>
                  <Td><ConnStateBadge s={c.state} />{c.lastTested && <div className="text-[11px] text-text-tertiary mt-1">Tested {ago(c.lastTested)}</div>}</Td>
                  <Td className="text-[13px] text-text-secondary">{used(c.id) ? `${used(c.id)} dataset${used(c.id) === 1 ? "" : "s"}` : "Nothing yet"}</Td>
                </Tr>
              );
            })}
            {connections.length === 0 && <Tr><Td colSpan={5} className="text-center text-text-secondary py-10">No connections yet. Add one to read from or write to a system.</Td></Tr>}
          </tbody>
        </Table>
      </Card>

      <ConnectionWizard open={open} onClose={() => setOpen(false)} />

      <Drawer open={!!conn} onClose={() => { setSel(null); setLast(null); }} title={conn?.name ?? ""} subtitle={spec?.name}
        footer={conn && <><Button variant="secondary" onClick={() => setDel(conn)}><Trash2 size={14} /> Delete</Button><Button variant="primary" onClick={async () => { const r = await refinery.testConnection(conn.id); if (!r.ok) { toast(r.error, "error"); return; } setLast({ id: conn.id, steps: r.checked ? r.steps : [] }); toast(!r.checked ? r.message : r.queued ? "Test queued for the runner pool" : r.passed ? "Connection works" : "Test failed", r.queued || !r.checked ? "info" : r.passed ? "success" : "error"); }}><RefreshCw size={14} /> Test connection</Button></>}>
        {conn && spec && (
          <div className="space-y-5">
            <div className="flex items-center gap-3"><ConnectorMark id={conn.connector} size={44} /><div><ConnStateBadge s={conn.state} /><div className="text-xs text-text-tertiary mt-1">{conn.lastTested ? `Last tested ${ago(conn.lastTested)}` : "Never tested"}</div></div></div>
            {conn.state === "failed" && !last && <Notice tone="bad" title="The last test failed">{method?.identity ? "This method uses the runner's identity. Check the pool's role or identity has access." : "The system rejected the credentials. Rotate the secret and test again."}</Notice>}
            {last?.id === conn.id && (
              <ul className="divide-y divide-border border border-border rounded-md">
                {last.steps.map((s) => <li key={s.name} className="flex items-start gap-3 px-3.5 py-2.5">{s.ok ? <Check size={16} className="text-status-healthy mt-0.5 shrink-0" /> : <X size={16} className="text-status-down mt-0.5 shrink-0" />}<div className="min-w-0"><div className="text-[13px] font-medium">{s.name}</div><div className="text-xs text-text-secondary">{s.detail}</div></div></li>)}
              </ul>
            )}
            <section><h3 className="text-[13px] font-semibold mb-2">Where it is</h3><KeyValue rows={[...spec.settings.filter((f) => conn.settings[f.key]).map((f) => [f.label, <span key={f.key} className="font-code text-[12px]">{conn.settings[f.key]}</span>] as [string, React.ReactNode]), ["Runs on", conn.pool]]} /></section>
            <section><h3 className="text-[13px] font-semibold mb-2">How it signs in</h3>
              <KeyValue rows={[["Method", method?.label ?? conn.auth], ...(method?.fields.filter((f) => f.kind !== "secret" && conn.settings[f.key]).map((f) => [f.label, <span key={f.key} className="font-code text-[12px]">{conn.settings[f.key]}</span>] as [string, React.ReactNode]) ?? [])]} />
              {Object.keys(conn.secretRefs).length > 0 ? (
                <div className="mt-3 space-y-1.5">{Object.entries(conn.secretRefs).map(([k, v]) => { const label = method?.fields.find((f) => f.key === k)?.label ?? k; return <div key={k} className="rounded-md bg-surface-subtle border border-border px-3 py-2"><div className="text-[11px] text-text-tertiary">{label}</div><div className="font-code text-[11px] break-all text-text-secondary">{v}</div>{isLive && <div className="mt-2"><RotateSecret connectionId={conn.id} secretKey={k} label={label} /></div>}</div>; })}</div>
              ) : <p className="text-xs text-text-tertiary mt-3">{method?.identity ? "Uses the runner's own identity. No secret is stored." : "No secret is stored for this method."}</p>}
            </section>
            <p className="text-xs text-text-tertiary">Added by {conn.createdBy} {ago(conn.createdAt)}.</p>
          </div>
        )}
      </Drawer>

      <Confirm open={!!del} onClose={() => setDel(null)} danger title="Delete connection" confirmLabel="Delete connection" phrase={del?.name}
        body={<p>{del && used(del.id) > 0 ? `${used(del.id)} dataset${used(del.id) === 1 ? " reads" : "s read"} through ${del.name}. They keep their profile but cannot be refreshed or run until you connect them to another system.` : `${del?.name} will be removed. Its secrets are deleted from the secret manager.`}</p>}
        onConfirm={async () => { if (del) { const r = await refinery.removeConnection(del.id); if (r.ok) { setSel(null); toast("Connection deleted"); } else toast(r.error, "error"); } }} />
    </div>
  );
}
