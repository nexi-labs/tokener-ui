"use client";

import clsx from "clsx";
import { Copy, DatabaseZap, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { NodeIcon } from "@/components/studio/icons";
import { Drawer, Kpi, Loading, Notice, relTime } from "@/components/mlops/ui";
import { STATUS_LEGEND } from "@/lib/mlops/catalog";
import { FAMILY_LABEL, type IntegrationStatus } from "@/lib/mlops/types";
import { connectorApi, errorText, putListing, reloadListings, useServerCatalogue, type Hosting, type Listing } from "@/lib/platform/connector-server";
import { toast } from "@/lib/mlops/toast";

const HOSTING: Record<Hosting, string> = { BUILTIN: "Installed with the platform", CONTRACT: "Contract", REMOTE: "Remote service" };

/** The connector catalogue held by the control plane. A platform operator publishes, sets how mature each connector is, and switches it on or off for organizations. */
export function ServerCatalogue() {
  const { listings, error, loading } = useServerCatalogue(true);
  const [fam, setFam] = useState("all");
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<{ name: string; text: string } | null>(null);

  const setStatus = async (l: Listing, status: IntegrationStatus, enabled: boolean) => {
    setBusy(l.id);
    setRefusal(null);
    try { const out = await connectorApi.setStatus(l.id, status, enabled); putListing(out); toast(`${l.def.name}: ${STATUS_LEGEND[out.status].label}${out.enabled ? "" : ", switched off"}`); }
    catch (e) { setRefusal({ name: l.def.name, text: errorText(e) }); }
    setBusy("");
  };
  const seed = async () => {
    setBusy("seed");
    try { const n = await connectorApi.seed(); await reloadListings(); toast(n === 0 ? "Every standard connector is already in the catalogue." : `${n} standard connector${n === 1 ? "" : "s"} added.`); }
    catch (e) { toast(errorText(e), "error"); }
    setBusy("");
  };

  if (listings === null) return error ? <Notice tone="bad" title="The catalogue could not be loaded">{error}</Notice> : <Loading />;
  const rows = listings.filter((l) => fam === "all" || l.def.family === fam);
  const usable = listings.filter((l) => l.enabled && l.status !== "planned").length;
  const sel = listings.find((l) => l.id === open);

  return (
    <div className="space-y-5">
      <PageHeader title="Connector catalogue" description="You create and approve connectors here. A new connector is a draft that customers cannot see. Setting it to Beta or Available approves it, and it then appears in every organization's hub and pickers. Customers do not create connectors, they only use the ones you approve."
        action={<div className="flex gap-2"><Button variant="secondary" onClick={seed} disabled={busy === "seed" || loading}><DatabaseZap size={15} /> {busy === "seed" ? "Adding" : "Add standard connectors"}</Button><Link href="/platform/connectors/new"><Button variant="primary"><Plus size={15} /> Publish a connector</Button></Link></div>} />
      {error && <Notice tone="warn" title="Showing the last list that loaded">{error}</Notice>}
      {refusal && <Notice tone="warn" title={`${refusal.name} was not changed`}>{refusal.text}</Notice>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Connectors" value={listings.length} />
        <Kpi label="Visible to customers" value={usable} sub="Approved and switched on" />
        <Kpi label="Run by a contract" value={listings.filter((l) => l.hosting === "CONTRACT").length} />
        <Kpi label="Drafts" value={listings.filter((l) => l.status === "planned").length} sub="Hidden until approved" />
      </div>
      {listings.length === 0 ? (
        <EmptyState icon={DatabaseZap} title="The catalogue is empty" description="Add the standard connectors that ship with the platform. It never overwrites a connector you changed." action={<Button variant="primary" onClick={seed} disabled={busy === "seed"}>Add standard connectors</Button>} />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Select aria-label="Family" value={fam} onChange={(e) => setFam(e.target.value)} className="max-w-xs"><option value="all">All families</option>{Object.entries(FAMILY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            <span className="text-xs text-text-tertiary">{rows.length} connectors</span>
          </div>
          <Card>
            <Table>
              <Thead><tr><Th>Connector</Th><Th>Family</Th><Th>Runs as</Th><Th>Version</Th><Th>Approval</Th><Th>Customers see it</Th><Th>{""}</Th></tr></Thead>
              <tbody>
                {rows.map((l) => (
                  <Tr key={l.id}>
                    <Td><button onClick={() => setOpen(l.id)} className="flex items-center gap-2.5 text-left"><div className="h-8 w-8 rounded bg-surface-muted grid place-items-center">{l.def.icon ? <NodeIcon icon={l.def.icon} size={18} /> : null}</div><div><div className="text-sm font-medium hover:underline">{l.def.name}</div><div className="text-xs text-text-tertiary font-mono">{l.id}</div></div></button></Td>
                    <Td className="text-text-secondary">{FAMILY_LABEL[l.def.family] ?? l.def.family}</Td>
                    <Td className="text-text-secondary">{HOSTING[l.hosting]}</Td>
                    <Td className="tabular-nums text-text-secondary">{l.version}</Td>
                    <Td>
                      <select aria-label={`Status of ${l.def.name}`} value={l.status} disabled={busy === l.id} onChange={(e) => setStatus(l, e.target.value as IntegrationStatus, l.enabled)} className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm">
                        {(["planned", "beta", "available", "custom"] as const).map((s) => <option key={s} value={s}>{s === "planned" ? "Draft, hidden" : STATUS_LEGEND[s].label}</option>)}
                      </select>
                    </Td>
                    <Td>
                      <button role="switch" aria-checked={l.enabled} aria-label={`Offer ${l.def.name} to organizations`} disabled={busy === l.id} onClick={() => setStatus(l, l.status, !l.enabled)}
                        className={clsx("relative h-5 w-9 rounded-full transition-colors", l.enabled ? "bg-[#07191E]" : "bg-border-strong")}><span className={clsx("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", l.enabled ? "left-[18px]" : "left-0.5")} /></button>
                      <div className="text-xs text-text-tertiary mt-1">{l.enabled && l.status !== "planned" ? "Visible" : l.status === "planned" ? "Draft" : "Switched off"}</div>
                    </Td>
                    <Td><div className="flex justify-end gap-1">
                      {l.hosting !== "BUILTIN" && <Link href={`/platform/connectors/new?edit=${l.id}`} aria-label={`Edit ${l.def.name}`}><Button variant="ghost"><Pencil size={14} /></Button></Link>}
                      <Link href={`/platform/connectors/new?from=${l.id}`} aria-label={`Copy ${l.def.name}`} title="Start a new connector from this one"><Button variant="ghost"><Copy size={14} /></Button></Link>
                    </div></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}
      <Notice tone="info">The server will not mark a connector Beta or Available while nothing real backs it: an installed implementation, a contract whose examples pass, or a remote service that answered the handshake. It says which when it refuses.</Notice>

      <Drawer open={!!sel} onClose={() => setOpen(null)} title={sel?.def.name ?? ""} subtitle={sel && <span className="inline-flex items-center gap-2">{HOSTING[sel.hosting]} <Badge tone={sel.enabled ? "healthy" : "neutral"}>{sel.enabled ? "Offered" : "Switched off"}</Badge></span>}
        footer={<Button variant="secondary" onClick={() => setOpen(null)}>Close</Button>}>
        {sel && (
          <div className="space-y-4 text-[13px]">
            <p className="text-text-secondary">{sel.def.blurb}</p>
            <dl className="grid grid-cols-[130px_1fr] gap-y-2">
              <dt className="text-text-tertiary">Version</dt><dd className="tabular-nums">{sel.version}</dd>
              <dt className="text-text-tertiary">Status</dt><dd>{STATUS_LEGEND[sel.status].label}</dd>
              {sel.remoteUrl && <><dt className="text-text-tertiary">Service address</dt><dd className="font-mono text-xs break-all">{sel.remoteUrl}</dd></>}
              <dt className="text-text-tertiary">Last changed</dt><dd>{sel.updatedAt ? `${relTime(sel.updatedAt)} by ${sel.updatedBy}` : "Not recorded"}</dd>
              {sel.notes && <><dt className="text-text-tertiary">Note</dt><dd>{sel.notes}</dd></>}
            </dl>
            <section><h3 className="font-semibold mb-2">Releases</h3>
              {sel.releases.length === 0 ? <p className="text-text-secondary">None recorded.</p> : (
                <ul className="divide-y divide-border border border-border rounded-md">{sel.releases.map((r) => (
                  <li key={r.version + r.digest} className="px-3 py-2.5"><div className="flex items-center justify-between"><span className="font-medium tabular-nums">{r.version}</span><span className="text-xs text-text-tertiary">{r.publishedAt ? relTime(r.publishedAt) : ""} {r.publishedBy && `by ${r.publishedBy}`}</span></div>
                    {r.note && <p className="text-xs text-text-secondary mt-0.5">{r.note}</p>}<p className="text-[11px] text-text-tertiary font-mono mt-0.5">{r.digest.slice(0, 22)}</p></li>
                ))}</ul>
              )}
            </section>
          </div>
        )}
      </Drawer>
    </div>
  );
}
