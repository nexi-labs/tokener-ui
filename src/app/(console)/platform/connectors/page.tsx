"use client";

import { Pencil, Plus, RotateCcw, Trash2, Copy } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { NodeIcon } from "@/components/studio/icons";
import { Confirm, Notice, relTime } from "@/components/mlops/ui";
import { INTEGRATIONS, STATUS_LEGEND } from "@/lib/mlops/catalog";
import { FAMILY_LABEL, type IntegrationStatus } from "@/lib/mlops/types";
import { discardDraft, removePublished, setOverride, useCatalogueState } from "@/lib/platform/connector-catalogue";
import { toast } from "@/lib/mlops/toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ServerCatalogue } from "@/components/platform/ServerCatalogue";

/**
 * Where platform admins shape the connector catalogue every organization sees. A published connector needs no backend release: its contract is
 * data that the generic runtime executes. Built-in entries can be re-labelled or retired here. Their definitions change with a release.
 */
function LocalCatalogue() {
  const st = useCatalogueState();
  const [fam, setFam] = useState("all");
  const [remove, setRemove] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!st) return [];
    const pub = Object.values(st.published);
    return [...pub.map((d) => ({ d, source: "published" as const })), ...INTEGRATIONS.map((d) => ({ d, source: "built-in" as const }))]
      .filter((r) => fam === "all" || r.d.family === fam);
  }, [st, fam]);
  if (!st) return null;
  const drafts = Object.values(st.drafts);

  return (
    <div className="space-y-5">
      <PageHeader title="Connector catalogue" description="You create and approve connectors here. Customers do not create them, they only use what you approve. A connector is visible to customers once it is Beta or Available, and hidden while it is in development."
        action={<Link href="/platform/connectors/new"><Button variant="primary"><Plus size={15} /> Publish a connector</Button></Link>} />

      {drafts.length > 0 && (
        <Card>
          <CardHeader title="Drafts" subtitle="Saved but not published. Nobody else sees them." />
          <CardBody className="divide-y divide-border">
            {drafts.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3 min-w-0"><NodeIcon icon={d.def.icon} size={20} /><div className="min-w-0"><div className="text-sm font-medium truncate">{d.def.name || d.id}</div><div className="text-xs text-text-tertiary">Saved {relTime(d.savedAt)}</div></div></div>
                <div className="flex gap-2"><Link href={`/platform/connectors/new?draft=${d.id}`}><Button variant="secondary">Continue</Button></Link><Button variant="ghost" aria-label="Discard draft" onClick={() => { discardDraft(d.id); toast("Draft discarded"); }}><Trash2 size={14} /></Button></div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <Select aria-label="Family" value={fam} onChange={(e) => setFam(e.target.value)} className="max-w-xs">
          <option value="all">All families</option>
          {Object.entries(FAMILY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <span className="text-xs text-text-tertiary">{rows.length} connectors</span>
      </div>

      <Card>
        <Table>
          <Thead><tr><Th>Connector</Th><Th>Family</Th><Th>Source</Th><Th>Runs as</Th><Th>Status</Th><Th> </Th></tr></Thead>
          <tbody>
            {rows.map(({ d, source }) => {
              const o = st.overrides[d.id];
              const status = o?.status ?? d.status;
              return (
                <Tr key={d.id}>
                  <Td><div className="flex items-center gap-2.5"><div className="h-8 w-8 rounded bg-surface-muted grid place-items-center"><NodeIcon icon={d.icon} size={18} /></div><div><div className="text-sm font-medium">{d.name}{o?.retired && <span className="ml-2 text-xs text-text-tertiary">retired</span>}</div><div className="text-xs text-text-tertiary">{d.vendor}</div></div></div></Td>
                  <Td className="text-text-secondary">{FAMILY_LABEL[d.family]}</Td>
                  <Td>{source === "published" ? <span>Published, revision {d.published?.revision}</span> : "Built in"}</Td>
                  <Td className="text-text-secondary">{d.published?.hosting === "remote" ? "Remote service" : d.contract ? "Contract" : "Release"}</Td>
                  <Td>
                    <select aria-label={`Status of ${d.name}`} value={status} onChange={(e) => { setOverride(d.id, { status: e.target.value as IntegrationStatus }, "platform admin", `Status set to ${STATUS_LEGEND[e.target.value as IntegrationStatus].label}`); toast(`${d.name} is now ${STATUS_LEGEND[e.target.value as IntegrationStatus].label}`); }} className="h-8 rounded-md border border-border-strong bg-surface px-1.5 text-xs">
                      {(["planned", "beta", "available", "custom"] as const).map((s) => <option key={s} value={s}>{STATUS_LEGEND[s].label}</option>)}
                    </select>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      {source === "published" && <Link href={`/platform/connectors/new?edit=${d.id}`} aria-label={`Edit ${d.name}`}><Button variant="ghost"><Pencil size={14} /></Button></Link>}
                      <Link href={`/platform/connectors/new?from=${d.id}`} aria-label={`Copy ${d.name}`} title="Start a new connector from this one"><Button variant="ghost"><Copy size={14} /></Button></Link>
                      <Button variant="ghost" aria-label={o?.retired ? `Restore ${d.name}` : `Retire ${d.name}`} title={o?.retired ? "Offer it again" : "Stop offering it for new connections"} onClick={() => { setOverride(d.id, { retired: !o?.retired }, "platform admin", o?.retired ? "Restored" : "Retired"); toast(o?.retired ? `${d.name} restored` : `${d.name} retired. Existing connections keep working.`); }}><RotateCcw size={14} /></Button>
                      {source === "published" && <Button variant="ghost" aria-label={`Remove ${d.name}`} onClick={() => setRemove(d.id)}><Trash2 size={14} /></Button>}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="History" subtitle="Every change to the catalogue, newest first. The server records the same events in the audit log." />
        <CardBody>
          {st.history.length === 0 ? <p className="text-sm text-text-tertiary">Nothing yet.</p> : (
            <ul className="space-y-1.5 text-[13px]">{st.history.slice(0, 20).map((h, i) => <li key={i} className="flex gap-3"><span className="text-text-tertiary w-24 shrink-0">{relTime(h.at)}</span><span><span className="font-code text-xs">{h.connector}</span> {h.what}, by {h.by}</span></li>)}</ul>
          )}
        </CardBody>
      </Card>
      <Notice tone="info">Retiring a connector hides it from new connections only. Connections that already use it keep working. Removing a published connector is blocked on the server while any connection uses it.</Notice>

      <Confirm open={!!remove} onClose={() => setRemove(null)} danger title="Remove connector" confirmLabel="Remove" phrase={remove ?? undefined}
        body={<p>This takes the connector out of the catalogue for every organization. Type its identifier to confirm.</p>}
        onConfirm={() => { removePublished(remove!, "platform admin"); toast("Connector removed"); setRemove(null); }} />
    </div>
  );
}

/** A signed-in operator works on the control plane's catalogue. The sample workspace keeps its own in the browser. */
export default function ConnectorCataloguePage() {
  const { status } = useAuth();
  return status === "session" ? <ServerCatalogue /> : <LocalCatalogue />;
}
