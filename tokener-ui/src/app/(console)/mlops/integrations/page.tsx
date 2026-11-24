"use client";

import clsx from "clsx";
import { CheckCircle2, CircleDashed, ExternalLink, MinusCircle, Plug, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { NodeIcon } from "@/components/studio/icons";
import { ConnectionWizard } from "@/components/mlops/ConnectionWizard";
import { Confirm, DemoTag, Drawer, Modal, EnvBadge, GuardButton, HealthBadge, IntegrationStatusBadge, KeyValue, Notice, SecretRef, Tabs, relTime, useRole } from "@/components/mlops/ui";
import { STATUS_LEGEND, integrationById } from "@/lib/mlops/catalog";
import { useIntegrations } from "@/lib/platform/integrations";
import { ConnectionCode } from "@/components/mlops/ConnectionCode";
import { mlops, useMlops, useMlopsStatus } from "@/lib/mlops/store";
import { toast } from "@/lib/mlops/toast";
import { AUTH_LABEL, CAPABILITY_LABEL, ENVS, ENV_LABEL, FAMILY_LABEL, type Env, type Family, type IntegrationStatus } from "@/lib/mlops/types";

export default function IntegrationsPage() {
  const INTEGRATIONS = useIntegrations();
  const s = useMlops()!;
  const role = useRole();
  const [tab, setTab] = useState<"catalogue" | "connections">("catalogue");
  const [q, setQ] = useState("");
  const [fam, setFam] = useState<Family | "all">("all");
  const [status, setStatus] = useState<IntegrationStatus | "all">("all");
  const [env, setEnv] = useState<Env | "all">("all");
  const [detail, setDetail] = useState<string | null>(null);
  const [connId, setConnId] = useState<string | null>(null);
  const [wizard, setWizard] = useState<{ open: boolean; id?: string }>({ open: false });
  const [del, setDel] = useState<string | null>(null);
  const live = useMlopsStatus().mode === "live";
  const [rotate, setRotate] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [rotating, setRotating] = useState(false);
  const [rotateErr, setRotateErr] = useState("");

  const list = useMemo(() => INTEGRATIONS.filter((i) => (fam === "all" || i.family === fam) && (status === "all" || i.status === status) && (!q || (i.name + i.vendor + i.blurb).toLowerCase().includes(q.toLowerCase()))), [INTEGRATIONS, q, fam, status]);
  const conns = s.connections.filter((c) => env === "all" || c.env === env);
  const d = detail ? integrationById(detail) : undefined;
  const c = connId ? s.connections.find((x) => x.id === connId) : undefined;
  const ci = c ? integrationById(c.integrationId) : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Integrations and connections"
        description="The catalogue shows what each integration supports and how mature it is. Connections are your configured, scoped, verified links to real systems."
        action={<GuardButton action="connection.create" role={role} variant="primary" onClick={() => setWizard({ open: true })}><Plus size={15} /> Add connection</GuardButton>}
      />
      <Tabs label="Integrations" value={tab} onChange={setTab} tabs={[{ id: "catalogue", label: "Catalogue", count: INTEGRATIONS.length }, { id: "connections", label: "Connections", count: s.connections.length }]} />

      {tab === "catalogue" && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(Object.keys(STATUS_LEGEND) as IntegrationStatus[]).map((k) => (
              <div key={k} className="bg-surface border border-border rounded-md px-3.5 py-2.5 text-xs">
                <div className="flex items-center justify-between"><Badge tone={STATUS_LEGEND[k].tone}>{STATUS_LEGEND[k].label}</Badge><span className="tabular-nums font-semibold text-sm">{INTEGRATIONS.filter((i) => i.status === k).length}</span></div>
                <p className="text-text-secondary mt-1.5 leading-snug">{STATUS_LEGEND[k].text}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" /><Input aria-label="Search integrations" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 w-56" /></div>
            <Select aria-label="Family" value={fam} onChange={(e) => setFam(e.target.value as Family | "all")} className="w-52"><option value="all">All families</option>{Object.entries(FAMILY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
            <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as IntegrationStatus | "all")} className="w-40"><option value="all">Any status</option>{(Object.keys(STATUS_LEGEND) as IntegrationStatus[]).map((k) => <option key={k} value={k}>{STATUS_LEGEND[k].label}</option>)}</Select>
          </div>
          {list.length === 0 ? <Card><EmptyState icon={Plug} title="No integrations match" description="Clear the search or filters to see the whole catalogue." action={<Button onClick={() => { setQ(""); setFam("all"); setStatus("all"); }}>Clear filters</Button>} /></Card> : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {list.map((i) => {
                const n = s.connections.filter((x) => x.integrationId === i.id).length;
                return (
                  <button key={i.id} onClick={() => setDetail(i.id)} className="text-left bg-surface border border-border rounded-lg shadow-card p-4 hover:border-border-strong transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-md bg-surface-muted grid place-items-center shrink-0"><NodeIcon icon={i.icon} size={22} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold truncate">{i.name}</span><IntegrationStatusBadge s={i.status} wave={i.wave} /></div>
                        <div className="text-xs text-text-tertiary truncate">{i.vendor}</div>
                      </div>
                    </div>
                    <p className="text-[13px] text-text-secondary mt-3 line-clamp-2">{i.blurb}</p>
                    <div className="mt-3 flex items-center justify-between text-xs text-text-tertiary"><span>{FAMILY_LABEL[i.family]}</span><span>{n ? `${n} connection${n > 1 ? "s" : ""}` : "Not connected"}</span></div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "connections" && (
        <>
          <div className="flex gap-2"><Select aria-label="Environment" value={env} onChange={(e) => setEnv(e.target.value as Env | "all")} className="w-44"><option value="all">All environments</option>{ENVS.map((e) => <option key={e} value={e}>{ENV_LABEL[e]}</option>)}</Select></div>
          <Card>
            {conns.length === 0 ? <EmptyState icon={Plug} title="No connections here yet" description="Connect your first system to discover resources and deploy to it." action={<Button variant="primary" onClick={() => setWizard({ open: true })}>Add connection</Button>} /> : (
              <Table>
                <Thead><tr><Th>Name</Th><Th>Integration</Th><Th>Environment</Th><Th>Health</Th><Th>Access</Th><Th>Last verified</Th><Th>Credential</Th></tr></Thead>
                <tbody>
                  {conns.map((x) => (
                    <Tr key={x.id}>
                      <Td><button className="font-medium hover:underline text-left" onClick={() => setConnId(x.id)}>{x.name}</button></Td>
                      <Td className="text-text-secondary">{integrationById(x.integrationId)?.name}</Td>
                      <Td><EnvBadge env={x.env} /></Td><Td><HealthBadge h={x.health} /></Td>
                      <Td><Badge tone={x.permissions === "read-only" ? "neutral" : "info"}>{x.permissions}</Badge></Td>
                      <Td className="text-text-secondary">{relTime(x.lastVerifiedAt)}</Td>
                      <Td className="text-text-secondary">{x.credentialExpiresAt ? <span className="text-[#9A5F05]">expires {relTime(x.credentialExpiresAt)}</span> : `rotated ${relTime(x.credentialRotatedAt)}`}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}

      <Drawer open={!!d} onClose={() => setDetail(null)} title={d?.name ?? ""} subtitle={d && <span className="inline-flex items-center gap-2">{d.vendor} <IntegrationStatusBadge s={d.status} wave={d.wave} /></span>}
        footer={d && <><Button variant="secondary" onClick={() => setDetail(null)}>Close</Button><GuardButton action="connection.create" role={role} variant="primary" onClick={() => { setWizard({ open: true, id: d.id }); setDetail(null); }}>Connect</GuardButton></>}>
        {d && (
          <div className="space-y-5 text-[13px]">
            <p className="text-text-secondary">{d.blurb}</p>
            {d.status === "planned" && <Notice tone="warn" title="Connector in development">The connector has not been released yet. You can configure the connection now; tests return sample results until it ships.</Notice>}
            <KeyValue rows={[["Target version", d.versionTarget], ["Auth modes", d.auth.map((a) => AUTH_LABEL[a]).join(", ")], ["Private network", d.privateConnectivity ? "Usually reached through an agent or private link" : "Typically direct"]]} />
            <section><h3 className="font-semibold mb-2">Capabilities</h3>
              <div className="space-y-1.5">{d.capabilities.map((c) => (
                <div key={c.id} className="flex items-start gap-2">{c.level === "full" ? <CheckCircle2 size={15} className="text-status-healthy mt-0.5 shrink-0" /> : c.level === "partial" ? <CircleDashed size={15} className="text-status-degraded mt-0.5 shrink-0" /> : <MinusCircle size={15} className="text-text-tertiary mt-0.5 shrink-0" />}<span>{CAPABILITY_LABEL[c.id]}{c.note && <span className="block text-xs text-text-tertiary">{c.note}</span>}</span></div>
              ))}</div></section>
            <section><h3 className="font-semibold mb-2">Code</h3>
              <ConnectionCode compact input={{ integration: d, name: "my-" + d.id, env: "development", scope: "nexi-ai/support-ml/development", owner: "ml-platform@nexi.example", auth: d.auth[0], secretRef: d.auth[0] === "none" ? undefined : `secretref://vault/nexi/development/my-${d.id}`, endpoint: String(d.fields.find((f) => f.key === "endpoint")?.placeholder ?? ""), tlsVerify: true, permissions: "read-only", settings: {} }} /></section>
            <section><h3 className="font-semibold mb-2">Prerequisites</h3><ul className="list-disc pl-4 space-y-1 text-text-secondary">{d.prerequisites.map((p) => <li key={p}>{p}</li>)}</ul></section>
            {d.compliance && d.compliance.length > 0 && <section><h3 className="font-semibold mb-2">Compliance and go-live</h3><ul className="list-disc pl-4 space-y-1 text-text-secondary">{d.compliance.map((p) => <li key={p}>{p}</li>)}</ul><p className="text-xs text-text-tertiary mt-2">A summary to help you prepare, not legal advice.</p></section>}
            <section><h3 className="font-semibold mb-2">Least-privilege permissions</h3>
              <div className="text-xs text-text-tertiary mb-1">Read-only discovery</div><ul className="list-disc pl-4 space-y-1 text-text-secondary mb-3">{d.permissions.read.map((p) => <li key={p}>{p}</li>)}</ul>
              <div className="text-xs text-text-tertiary mb-1">Only when write is enabled</div><ul className="list-disc pl-4 space-y-1 text-text-secondary">{d.permissions.write.map((p) => <li key={p}>{p}</li>)}</ul></section>
            {d.limitations.length > 0 && <section><h3 className="font-semibold mb-2">Limitations</h3><ul className="list-disc pl-4 space-y-1 text-text-secondary">{d.limitations.map((p) => <li key={p}>{p}</li>)}</ul></section>}
            {d.docs.length > 0 && <section><h3 className="font-semibold mb-2">Official documentation</h3><ul className="space-y-1">{d.docs.map((x) => <li key={x.url}><a className="inline-flex items-center gap-1.5 text-status-info hover:underline" href={x.url} target="_blank" rel="noreferrer noopener">{x.label}<ExternalLink size={12} /></a></li>)}</ul></section>}
          </div>
        )}
      </Drawer>

      <Drawer open={!!c} onClose={() => setConnId(null)} title={c?.name ?? ""} subtitle={c && <span className="inline-flex items-center gap-2"><EnvBadge env={c.env} />{c.demo && <DemoTag />}</span>}
        footer={c && (
          <>
            <GuardButton action="connection.delete" role={role} onClick={() => setDel(c.id)}><Trash2 size={14} /> Delete</GuardButton>
            <GuardButton action="connection.rotate" role={role} onClick={async () => { if (live) { setSecret(""); setRotateErr(""); setRotate(c.id); return; } const r = await mlops.rotateCredential(c.id); r.ok ? toast("Credential rotated in the secret manager. The reference is unchanged.") : toast(r.error, "error"); }} extraDisabled={!c.secretRef ? "This connection has no secret to rotate" : undefined}>Rotate credential</GuardButton>
            <Button variant="primary" onClick={async () => { const r = await mlops.verifyConnection(c.id); r.ok ? toast(`${c.name}: ${r.detail}`, r.health === "healthy" ? "success" : "error") : toast(r.error, "error"); }}><RefreshCw size={14} /> Test now</Button>
          </>
        )}>
        {c && ci && (
          <div className="space-y-4">
            <div className="flex items-center gap-3"><div className="h-10 w-10 rounded-md bg-surface-muted grid place-items-center"><NodeIcon icon={ci.icon} size={22} /></div><div><div className="text-sm font-semibold">{ci.name}</div><HealthBadge h={c.health} /></div></div>
            <p className={clsx("text-[13px] rounded-md px-3 py-2 border", c.health === "healthy" ? "border-border text-text-secondary" : "border-status-degraded/40 bg-status-degraded/5 text-text-primary")}>{c.healthDetail}</p>
            <KeyValue rows={[["Endpoint", <span className="font-code text-xs">{c.endpoint}</span>], ["Version", c.version ?? "unknown"], ["Authentication", AUTH_LABEL[c.auth]], ["Secret reference", <SecretRef key="s" value={c.secretRef} />], ["TLS verification", c.tlsVerify ? "On" : <span className="text-status-down">Off</span>], ["Access", c.permissions], ["Scope", c.scope], ["Owner", c.owner], ["Last verified", relTime(c.lastVerifiedAt)], ["Credential rotated", relTime(c.credentialRotatedAt)], ...(c.credentialExpiresAt ? [["Credential expires", relTime(c.credentialExpiresAt)] as [string, string]] : [])]} />
            <div><div className="text-[13px] font-semibold mb-1.5">Capabilities in use</div><div className="flex flex-wrap gap-1.5">{c.capabilities.map((k) => <Badge key={k}>{CAPABILITY_LABEL[k]}</Badge>)}</div></div>
            <div><div className="text-[13px] font-semibold mb-1.5">Used by</div>
              <ul className="text-[13px] text-text-secondary space-y-1">
                {s.deployments.filter((x) => x.connectionId === c.id).map((x) => <li key={x.id}>Deployment {x.name}</li>)}
                {s.pipelines.filter((p) => p.versions.some((v) => v.spec.nodes.some((n) => n.connection === c.id))).map((p) => <li key={p.id}>Pipeline {p.name}</li>)}
                {!s.deployments.some((x) => x.connectionId === c.id) && !s.pipelines.some((p) => p.versions.some((v) => v.spec.nodes.some((n) => n.connection === c.id))) && <li>Nothing yet</li>}
              </ul></div>
            <div><div className="text-[13px] font-semibold mb-1.5">Code</div>
              <ConnectionCode compact input={{ integration: ci, name: c.name, env: c.env, scope: c.scope, owner: c.owner, auth: c.auth, secretRef: c.secretRef, endpoint: c.endpoint === "n/a" ? "" : c.endpoint, tlsVerify: c.tlsVerify, permissions: c.permissions, connectionId: c.id, settings: c.settings ?? {} }} /></div>
          </div>
        )}
      </Drawer>

      <Confirm open={!!del} onClose={() => setDel(null)} danger title="Delete connection" confirmLabel="Delete" phrase={s.connections.find((x) => x.id === del)?.name}
        body={<p>This removes the connection record. The secret stays in your secret manager until you delete it there. Deployments and pipelines that use it block deletion.</p>}
        onConfirm={async () => { const r = await mlops.deleteConnection(del!); if (r.ok) { toast("Connection deleted"); setConnId(null); } else toast(r.error, "error"); }} />

      <Modal open={!!rotate} onClose={() => setRotate(null)} title="Rotate credential"
        footer={<><Button onClick={() => setRotate(null)}>Cancel</Button><Button variant="primary" disabled={rotating || !secret.trim()} onClick={async () => {
          setRotating(true); setRotateErr("");
          const r = await mlops.rotateCredential(rotate!, secret);
          setRotating(false);
          if (!r.ok) { setRotateErr(r.error); return; }
          setSecret(""); setRotate(null); toast("Credential rotated in the secret manager. The reference is unchanged.");
        }}>{rotating ? "Rotating..." : "Rotate"}</Button></>}>
        <div className="space-y-3">
          {rotateErr && <Notice tone="bad">{rotateErr}</Notice>}
          <Field label="New credential" hint="Sent once over TLS and stored only in your secret manager. It is never shown again.">
            <Input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} />
          </Field>
          <p className="text-xs text-text-tertiary">The secret reference stays the same, so pipelines and deployments that use this connection keep working. Run a test afterwards to confirm the new credential is accepted.</p>
        </div>
      </Modal>

      <ConnectionWizard open={wizard.open} initialIntegration={wizard.id} onClose={() => setWizard({ open: false })} />
    </div>
  );
}
