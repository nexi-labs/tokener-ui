"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Check, Lock, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Confirm, Kpi, Modal, Notice } from "@/components/mlops/ui";
import { OwnerSelect } from "@/components/org/OrgSelect";
import { AgentChip, useAgentColors } from "@/components/agents/bits";
import { PostureBadge, REACH_ICON } from "@/components/agents/NetworkBits";
import { agentNetworks, useAgents } from "@/lib/agents/store";
import { PATH_LABEL, assess, membersOf, memberCounts, pathOf, type AgentNetwork, type PathState } from "@/lib/agents/network";
import { PROTOCOL_BY_ID } from "@/lib/agents/topology";
import { toast } from "@/lib/mlops/toast";

const PATH_TONE: Record<PathState, "healthy" | "degraded" | "down" | "info" | "neutral"> = { private: "healthy", peered: "healthy", public: "info", internal: "neutral", open: "degraded", blocked: "down" };

export default function AgentNetworksPage() {
  const { agents, networks, links } = useAgents(); const colors = useAgentColors();
  const [editing, setEditing] = useState<AgentNetwork | "new" | null>(null);
  const [members, setMembers] = useState<AgentNetwork | null>(null);
  const [peering, setPeering] = useState<AgentNetwork | null>(null);
  const [removing, setRemoving] = useState<AgentNetwork | null>(null);
  const [pathFilter, setPathFilter] = useState<"all" | PathState>("all");

  const live = agents.filter((a) => a.state !== "retired");
  const cfgs = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, a.network])), [agents]);
  const counts = useMemo(() => memberCounts(cfgs), [cfgs]);
  const posture = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, assess(a, a.network, networks, counts)])), [agents, networks, counts]);
  const setUp = live.filter((a) => a.network); const publicOnes = live.filter((a) => a.network?.reach === "public"); const weak = live.filter((a) => posture[a.id].configured && (posture[a.id].grade === "D" || posture[a.id].grade === "E"));
  const paths = useMemo(() => links.map((l) => ({ l, p: pathOf(l, cfgs, networks) })), [links, cfgs, networks]);
  const shown = paths.filter((x) => pathFilter === "all" || x.p.state === pathFilter);
  const byId = Object.fromEntries(agents.map((a) => [a.id, a]));
  const bare = live.filter((a) => !a.network);

  return (
    <div className="space-y-6">
      <PageHeader title="Agent networks" description="Decide which agents can reach which. A private network is closed to everything outside it, with certificates between members. Agents that face the public sit behind the tok∑ner edge." action={<Button variant="primary" onClick={() => setEditing("new")}><Plus size={14} className="mr-1.5" />New network</Button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Agents with a network setup" value={`${setUp.length} of ${live.length}`} sub={live.length ? `${Math.round((setUp.length / live.length) * 100)}% covered` : undefined} tone={bare.length ? "warn" : undefined} />
        <Kpi label="Networks" value={networks.length} sub={`${networks.filter((n) => n.kind === "private").length} private`} />
        <Kpi label="Facing the public" value={publicOnes.length} sub={publicOnes.length ? `${publicOnes.filter((a) => (posture[a.id].grade ?? "E") <= "B").length} hardened` : undefined} />
        <Kpi label="Weak or exposed" value={weak.length} tone={weak.length ? "bad" : undefined} sub={weak.length ? weak.map((a) => a.title).slice(0, 2).join(", ") : "None"} />
      </div>

      {/* networks */}
      <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {networks.map((n) => {
          const ids = membersOf(n.id, cfgs); const peers = networks.filter((x) => n.peers.includes(x.id));
          return (
            <Card key={n.id}>
              <CardBody className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-md grid place-items-center bg-surface-muted shrink-0">{n.kind === "private" ? <Lock size={16} /> : <ShieldCheck size={16} />}</div>
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><h3 className="text-[15px] font-semibold">{n.name}</h3><Badge tone={n.kind === "private" ? "healthy" : "info"}>{n.kind === "private" ? "Private" : "Shared"}</Badge></div>
                    <p className="text-xs text-text-secondary mt-1">{n.description || "No description."}</p></div>
                  <div className="flex gap-0.5 shrink-0">
                    <button type="button" aria-label={`Edit ${n.name}`} onClick={() => setEditing(n)} className="h-7 w-7 grid place-items-center rounded text-text-tertiary hover:text-text-primary hover:bg-surface-muted"><Pencil size={14} /></button>
                    <button type="button" aria-label={`Delete ${n.name}`} onClick={() => setRemoving(n)} className="h-7 w-7 grid place-items-center rounded text-text-tertiary hover:text-status-down hover:bg-surface-muted"><Trash2 size={14} /></button>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-xs"><div><dt className="text-text-tertiary">Members prove who they are with</dt><dd className="mt-0.5 font-medium text-[13px]">{n.identity === "mtls" ? "Client certificates (mTLS)" : "Signed tokens (OIDC)"}</dd></div><div><dt className="text-text-tertiary">Owner</dt><dd className="mt-0.5 font-medium text-[13px]">{n.owner}</dd></div></dl>
                <div>
                  <div className="flex items-center justify-between mb-1.5"><span className="text-xs font-medium text-text-secondary">Members ({ids.length})</span><button type="button" onClick={() => setMembers(n)} className="text-xs underline text-text-secondary hover:text-text-primary">Manage</button></div>
                  <div className="flex flex-wrap gap-1.5">{ids.length === 0 ? <span className="text-xs text-text-tertiary">No agents yet.</span> : ids.map((id) => <Link key={id} href={`/agents/registry/${id}`}><AgentChip name={byId[id]?.title ?? id} color={colors[id] ?? "#888"} /></Link>)}</div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5"><span className="text-xs font-medium text-text-secondary">Peered with ({peers.length})</span><button type="button" onClick={() => setPeering(n)} className="text-xs underline text-text-secondary hover:text-text-primary">Change</button></div>
                  <div className="flex flex-wrap gap-1.5">{peers.length === 0 ? <span className="text-xs text-text-tertiary">None. Nothing outside can call in.</span> : peers.map((p) => <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-border-strong px-2 py-0.5 text-xs"><ArrowRight size={10} className="rotate-180" /><ArrowRight size={10} />{p.name}</span>)}</div>
                </div>
              </CardBody>
            </Card>);
        })}
        {networks.length === 0 && <Card className="lg:col-span-2"><CardBody><p className="text-sm text-text-secondary">No networks yet. Make one, then put agents in it.</p></CardBody></Card>}
      </div>

      {/* paths */}
      <Card>
        <CardHeader title="Paths between agents" subtitle="How each call between agents crosses the network boundaries." action={
          <Select aria-label="Show paths" className="!w-40 !h-8 text-xs" value={pathFilter} onChange={(e) => setPathFilter(e.target.value as "all" | PathState)}>
            <option value="all">All paths ({paths.length})</option>{(Object.keys(PATH_LABEL) as PathState[]).map((s) => <option key={s} value={s}>{PATH_LABEL[s]} ({paths.filter((x) => x.p.state === s).length})</option>)}</Select>} />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-left text-xs text-text-tertiary bg-surface-subtle"><tr><th className="px-5 py-2 font-medium">From</th><th className="px-3 py-2 font-medium">To</th><th className="px-3 py-2 font-medium">Protocol</th><th className="px-3 py-2 font-medium">Path</th><th className="px-3 py-2 font-medium">Why</th></tr></thead>
            <tbody className="divide-y divide-border">
              {shown.map(({ l, p }) => (
                <tr key={l.id}>
                  <td className="px-5 py-2.5"><Link href={`/agents/registry/${l.from}`} className="hover:underline font-medium">{byId[l.from]?.title}</Link></td>
                  <td className="px-3 py-2.5"><Link href={`/agents/registry/${l.to}`} className="hover:underline font-medium">{byId[l.to]?.title}</Link></td>
                  <td className="px-3 py-2.5 text-text-secondary">{PROTOCOL_BY_ID[l.protocol]?.label ?? l.protocol}</td>
                  <td className="px-3 py-2.5"><Badge tone={PATH_TONE[p.state]}>{PATH_LABEL[p.state]}</Badge></td>
                  <td className="px-3 py-2.5 text-xs text-text-secondary">{p.detail}</td>
                </tr>))}
              {shown.length === 0 && <tr><td colSpan={5} className="px-5 py-6 text-text-tertiary">No paths of this kind.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* coverage */}
      <Card>
        <CardHeader title="Every agent" subtitle="How each one is reached, and how well that protects it." />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-left text-xs text-text-tertiary bg-surface-subtle"><tr><th className="px-5 py-2 font-medium">Agent</th><th className="px-3 py-2 font-medium">Reach</th><th className="px-3 py-2 font-medium">Network</th><th className="px-3 py-2 font-medium">Outbound</th><th className="px-3 py-2 font-medium">Security</th><th className="w-24" /></tr></thead>
            <tbody className="divide-y divide-border">
              {live.map((a) => { const c = a.network; const r = c ? REACH_ICON[c.reach] : null; const net = networks.find((n) => n.id === c?.network); return (
                <tr key={a.id}>
                  <td className="px-5 py-2.5"><Link href={`/agents/registry/${a.id}`} className="font-medium hover:underline">{a.title}</Link><div className="text-xs text-text-tertiary">{a.department}</div></td>
                  <td className="px-3 py-2.5">{c && r ? <span className="inline-flex items-center gap-1.5 capitalize">{(() => { const I = r; return <I size={14} />; })()}{c.reach}</span> : <span className="text-text-tertiary">Open to the organisation</span>}</td>
                  <td className="px-3 py-2.5">{net ? net.name : <span className="text-text-tertiary">None</span>}</td>
                  <td className="px-3 py-2.5 text-text-secondary">{c ? (c.egress.mode === "allow-all" ? "Anywhere" : c.egress.mode === "deny-all" ? "Nothing" : `${c.egress.rules.length} allowed`) : <span className="text-text-tertiary">Anywhere</span>}</td>
                  <td className="px-3 py-2.5"><PostureBadge p={posture[a.id]} /></td>
                  <td className="px-3 py-2.5 text-right"><Link href={`/agents/registry/${a.id}?tab=network`} className="text-xs underline text-text-secondary hover:text-text-primary">{c ? "Open" : "Set up"}</Link></td>
                </tr>); })}
            </tbody>
          </table>
        </div>
      </Card>

      <NetworkDialog open={editing !== null} net={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      <MembersDialog net={members} onClose={() => setMembers(null)} />
      <PeersDialog net={peering} onClose={() => setPeering(null)} />
      <Confirm open={!!removing} onClose={() => setRemoving(null)} danger title={`Delete ${removing?.name ?? "network"}?`} confirmLabel="Delete network"
        body={removing ? `Agents in it stay, and lose their place in the network. Peering with ${removing.peers.length} other ${removing.peers.length === 1 ? "network" : "networks"} ends.` : ""}
        onConfirm={() => { if (!removing) return; const r = agentNetworks.remove(removing.id); if (!r.ok) toast(r.error, "error"); else toast(`${removing.name} deleted`, "success"); setRemoving(null); }} />
    </div>
  );
}

function NetworkDialog({ open, net, onClose }: { open: boolean; net: AgentNetwork | null; onClose: () => void }) {
  const [f, setF] = useState({ name: "", description: "", kind: "private" as AgentNetwork["kind"], identity: "mtls" as AgentNetwork["identity"], owner: "" });
  const [err, setErr] = useState(""); const [key, setKey] = useState("");
  // The form starts from the network being edited each time the dialog opens.
  const k = open ? (net?.id ?? "new") : ""; if (k !== key) { setKey(k); if (open) { setF(net ? { name: net.name, description: net.description, kind: net.kind, identity: net.identity, owner: net.owner } : { name: "", description: "", kind: "private", identity: "mtls", owner: "" }); setErr(""); } }
  const submit = () => { const r = net ? agentNetworks.update(net.id, f) : agentNetworks.create(f); if (!r.ok) { setErr(r.error); return; } toast(net ? "Network updated" : `${f.name} created`, "success"); onClose(); };
  return (
    <Modal open={open} onClose={onClose} title={net ? `Edit ${net.name}` : "New network"} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>{net ? "Save" : "Create network"}</Button></>}>
      <div className="space-y-4">
        {err && <Notice tone="bad">{err}</Notice>}
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Finance core" /></Field>
        <Field label="What it is for"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Agents that decide, match and pay." /></Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Kind" hint={f.kind === "private" ? "Closed to everything outside it unless peered." : "A meeting place between teams, with the same identity rules."}><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as AgentNetwork["kind"] })}><option value="private">Private</option><option value="shared">Shared</option></Select></Field>
          <Field label="Members prove who they are with" hint="Certificates say which agent called. Tokens say which identity it acts for."><Select value={f.identity} onChange={(e) => setF({ ...f, identity: e.target.value as AgentNetwork["identity"] })}><option value="mtls">Client certificates (mTLS)</option><option value="jwt">Signed tokens (OIDC)</option></Select></Field>
        </div>
        <OwnerSelect value={f.owner} onChange={(v) => setF({ ...f, owner: v })} hint="The group or person who answers for who is in this network." />
      </div>
    </Modal>
  );
}

function MembersDialog({ net, onClose }: { net: AgentNetwork | null; onClose: () => void }) {
  const { agents } = useAgents();
  const live = agents.filter((a) => a.state !== "retired");
  return (
    <Modal open={!!net} onClose={onClose} title={net ? `Members of ${net.name}` : "Members"} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      {net && <div className="space-y-2">
        <p className="text-sm text-text-secondary">An agent joins by taking this network in its own setup. An agent that has no setup is given an internal one.</p>
        <ul className="divide-y divide-border rounded-md border border-border">
          {live.map((a) => { const inIt = a.network?.network === net.id; const priv = inIt && a.network?.reach === "private"; return (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              <input id={`m-${a.id}`} type="checkbox" className="accent-[#07191E]" checked={inIt} disabled={priv} onChange={(e) => { const r = agentNetworks.setMember(net.id, a.id, e.target.checked); if (!r.ok) toast(r.error, "error"); }} />
              <label htmlFor={`m-${a.id}`} className="flex-1 text-[13px]"><span className="font-medium">{a.title}</span><span className="text-text-tertiary"> {a.department}</span></label>
              {priv && <span className="text-xs text-text-tertiary">Private to it</span>}
              {!inIt && a.network?.network && <span className="text-xs text-text-tertiary">In {agents.length ? "another network" : ""}</span>}
            </li>); })}
        </ul>
      </div>}
    </Modal>
  );
}

function PeersDialog({ net, onClose }: { net: AgentNetwork | null; onClose: () => void }) {
  const { networks } = useAgents();
  const cur = networks.find((n) => n.id === net?.id);
  return (
    <Modal open={!!net} onClose={onClose} title={net ? `Peering for ${net.name}` : "Peering"} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      {cur && <div className="space-y-3">
        <p className="text-sm text-text-secondary">Peering is mutual. Members of both networks can call each other. Without it, a private network accepts calls only from its own members.</p>
        <ul className="divide-y divide-border rounded-md border border-border">
          {networks.filter((n) => n.id !== cur.id).map((n) => { const on = cur.peers.includes(n.id); return (
            <li key={n.id} className="flex items-center gap-3 px-3 py-2">
              <input id={`p-${n.id}`} type="checkbox" className="accent-[#07191E]" checked={on} onChange={(e) => agentNetworks.setPeers(cur.id, e.target.checked ? [...cur.peers, n.id] : cur.peers.filter((x) => x !== n.id))} />
              <label htmlFor={`p-${n.id}`} className="flex-1 text-[13px]"><span className="font-medium">{n.name}</span><span className="text-text-tertiary"> {n.kind}</span></label>
              {on && <Check size={14} className="text-status-healthy" />}
            </li>); })}
          {networks.length < 2 && <li className="px-3 py-3 text-sm text-text-tertiary">There is no other network to peer with.</li>}
        </ul>
      </div>}
    </Modal>
  );
}
