"use client";

import clsx from "clsx";
import { useState } from "react";
import { ChevronDown, ChevronUp, Cloud, ShieldCheck, Waypoints } from "lucide-react";
import { BUCKETS, type Bucket } from "@/lib/agents/network";
import { HEALTH_COLOR, HEALTH_LABEL, POLICY_KINDS, PROTOCOLS, STATE_COLORS, type Health, type PolicyKind, type Protocol } from "@/lib/agents/topology";

export type Highlight = { type: "protocol"; id: Protocol } | { type: "policy"; id: PolicyKind } | { type: "health"; id: Health } | { type: "exposure"; id: "exposure" } | { type: "security"; id: Bucket } | { type: "network"; id: string } | { type: "mesh"; id: string } | null;
export type Layers = { groups: boolean; exposure: boolean; labels: boolean; traffic: boolean; retired: boolean; connectors: boolean; security: boolean; zones: boolean; meshBadges: boolean; meshEdges: boolean };
type Counts = { protocols: Record<Protocol, number>; policies: Record<PolicyKind, number>; health: Partial<Record<Health, number>>; exposed: number; security: Record<Bucket, number> };

const HEALTH_ORDER: Health[] = ["healthy", "degraded", "failing", "suspended", "unmeasured"];

/** The key to the canvas, and its filters: clicking a protocol or a policy shows or hides it, and pointing at one lights up where it appears. */
export type NetRow = { id: string; name: string; color: string; kind: string; count: number; peers: number };
export type MeshRow = { id: string; name: string; color: string; status: string; count: number; pattern: string };
export function Legend({ off, setOff, layers, setLayers, counts, highlight, setHighlight, nets, meshes }: {
  off: { protocols: Protocol[]; policies: PolicyKind[] }; setOff: (o: { protocols: Protocol[]; policies: PolicyKind[] }) => void;
  layers: Layers; setLayers: (l: Layers) => void; counts: Counts; highlight: Highlight; setHighlight: (h: Highlight) => void; nets: NetRow[]; meshes: MeshRow[];
}) {
  const [open, setOpen] = useState(true);
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const hot = (h: NonNullable<Highlight>) => ({ onPointerEnter: () => setHighlight(h), onPointerLeave: () => setHighlight(null), onFocus: () => setHighlight(h), onBlur: () => setHighlight(null) });
  const row = "w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-muted";
  const head = "px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary flex items-center justify-between";
  return (
    <div className="absolute left-3 top-3 w-[236px] max-h-[calc(100%-24px)] flex flex-col rounded-lg border border-border bg-surface shadow-card" onWheel={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center justify-between px-3 h-10 text-sm font-semibold">Legend {open ? <ChevronUp size={15} className="text-text-tertiary" /> : <ChevronDown size={15} className="text-text-tertiary" />}</button>
      {open && (
        <div className="overflow-y-auto px-1.5 pb-2 border-t border-border">
          <div className={head}><span>How agents talk</span>
            <button className="normal-case tracking-normal font-normal text-text-secondary hover:text-text-primary" onClick={() => setOff({ ...off, protocols: off.protocols.length ? [] : PROTOCOLS.map((p) => p.id) })}>{off.protocols.length ? "Show all" : "Hide all"}</button></div>
          {PROTOCOLS.map((p) => {
            const hidden = off.protocols.includes(p.id);
            return (
              <button key={p.id} type="button" aria-pressed={!hidden} title={p.blurb} className={clsx(row, hidden && "opacity-45")} onClick={() => setOff({ ...off, protocols: toggle(off.protocols, p.id) })} {...hot({ type: "protocol", id: p.id })}>
                <svg width="26" height="10" aria-hidden><line x1="1" y1="5" x2="18" y2="5" stroke={p.color} strokeWidth="2.6" strokeLinecap="round" /><path d="M17 1.5 L24 5 L17 8.5 Z" fill={p.color} /></svg>
                <span className={clsx("flex-1", hidden && "line-through")}>{p.label}</span><span className="text-xs text-text-tertiary tabular-nums">{counts.protocols[p.id]}</span>
              </button>
            );
          })}

          <div className={head}><span>Reach</span></div>
          <button type="button" aria-pressed={layers.exposure} className={clsx(row, !layers.exposure && "opacity-45")} onClick={() => setLayers({ ...layers, exposure: !layers.exposure })} {...hot({ type: "exposure", id: "exposure" })}
            title="Agents that can be called from outside the organisation.">
            <span className="w-[26px] grid place-items-center"><Cloud size={16} /></span><span className={clsx("flex-1", !layers.exposure && "line-through")}>Exposed to the internet</span><span className="text-xs text-text-tertiary tabular-nums">{counts.exposed}</span>
          </button>

          <div className={head}><span>Network security</span></div>
          {BUCKETS.map((b) => (
            <button key={b.id} type="button" title={b.blurb} className={clsx(row, !layers.security && "opacity-45")} {...hot({ type: "security", id: b.id })}>
              <span className="w-[26px] grid place-items-center"><ShieldCheck size={16} color={b.color} strokeWidth={2.2} /></span>
              <span className="flex-1">{b.label}</span><span className="text-xs text-text-tertiary tabular-nums">{counts.security[b.id]}</span>
            </button>
          ))}
          <p className="px-2 pt-1 text-[11px] leading-snug text-text-tertiary">A shield on an agent means it has a network setup. Its colour is the grade. Point at a line to light up those agents.</p>

          <div className={head}><span>Agent networks</span></div>
          {nets.map((n) => (
            <button key={n.id} type="button" title={`${n.kind === "private" ? "Private" : "Shared"} network. Peered with ${n.peers}.`} className={clsx(row, !layers.zones && "opacity-45")} {...hot({ type: "network", id: n.id })}>
              <span className="w-[26px] grid place-items-center"><span className="h-3 w-3 rounded-full" style={{ background: n.color }} /></span>
              <span className="flex-1 truncate">{n.name}</span><span className="text-xs text-text-tertiary tabular-nums">{n.count}</span>
            </button>
          ))}
          {nets.length === 0 && <p className="px-2 text-[11px] text-text-tertiary">No networks yet.</p>}
          <p className="px-2 pt-1 text-[11px] leading-snug text-text-tertiary">A tinted zone is a network. A dashed line between zones is a peering, which lets them call each other. The dot on an agent is its network.</p>

          <div className={head}><span>Agent meshes</span></div>
          {meshes.map((m) => (
            <button key={m.id} type="button" title={`${m.pattern}. ${m.status}.`} className={clsx(row, !layers.meshBadges && "opacity-45")} {...hot({ type: "mesh", id: m.id })}>
              <span className="w-[26px] grid place-items-center"><Waypoints size={16} color={m.color} strokeWidth={2.4} /></span>
              <span className="flex-1 truncate">{m.name}</span>{m.status !== "live" && <span className="text-[10px] text-text-tertiary">{m.status}</span>}<span className="text-xs text-text-tertiary tabular-nums">{m.count}</span>
            </button>
          ))}
          {meshes.length === 0 && <p className="px-2 text-[11px] text-text-tertiary">No meshes yet.</p>}
          <p className="px-2 pt-1 text-[11px] leading-snug text-text-tertiary">Point at a mesh to see who hands a case to whom. The badge on an agent means it belongs to a mesh.</p>

          <div className={head}><span>Policies around an agent</span>
            <button className="normal-case tracking-normal font-normal text-text-secondary hover:text-text-primary" onClick={() => setOff({ ...off, policies: off.policies.length ? [] : POLICY_KINDS.map((p) => p.id) })}>{off.policies.length ? "Show all" : "Hide all"}</button></div>
          {POLICY_KINDS.map((p) => {
            const hidden = off.policies.includes(p.id);
            return (
              <button key={p.id} type="button" aria-pressed={!hidden} title={p.blurb} className={clsx(row, hidden && "opacity-45")} onClick={() => setOff({ ...off, policies: toggle(off.policies, p.id) })} {...hot({ type: "policy", id: p.id })}>
                <svg width="26" height="10" aria-hidden><line x1="1" y1="5" x2="25" y2="5" stroke={p.color} strokeWidth="2.6" strokeLinecap="round" strokeDasharray="7 4" /></svg>
                <span className={clsx("flex-1", hidden && "line-through")}>{p.label}</span><span className="text-xs text-text-tertiary tabular-nums">{counts.policies[p.id]}</span>
              </button>
            );
          })}
          <p className="px-2 pt-1 text-[11px] leading-snug text-text-tertiary">Long dashes are enforced by tok∑ner. Dots are advisory: the agent runs elsewhere, so tok∑ner cannot enforce them.</p>

          <div className={head}><span>State of each agent</span></div>
          {HEALTH_ORDER.map((h) => (
            <button key={h} type="button" className={row} {...hot({ type: "health", id: h })}>
              <span className="w-[26px] grid place-items-center"><span className="h-3 w-3 rounded-full border-2" style={{ borderColor: HEALTH_COLOR[h], borderStyle: h === "unmeasured" ? "dashed" : "solid" }} /></span>
              <span className="flex-1">{HEALTH_LABEL[h]}</span><span className="text-xs text-text-tertiary tabular-nums">{counts.health[h] ?? 0}</span>
            </button>
          ))}
          <p className="px-2 pt-1 text-[11px] leading-snug text-text-tertiary flex flex-wrap items-center gap-x-2.5 gap-y-0.5">The ring shows the last 7 days:
            <Dot c={STATE_COLORS.ok} t="succeeded" /><Dot c={STATE_COLORS.waiting} t="waiting for a person" /><Dot c={STATE_COLORS.failed} t="failed" /></p>

          <div className={head}><span>While live</span></div>
          {([["#2563EB", "Working, with what it is doing"], [STATE_COLORS.waiting, "Waiting for a person"], [STATE_COLORS.failed, "A step failed"], ["#02F5A1", "Replicas changing, count in a chip"]] as const).map(([c, t]) => (
            <div key={t} className="flex items-center gap-2.5 px-2 py-1 text-[13px]"><span className="w-[26px] grid place-items-center"><span className="h-3 w-3 rounded-full border-[2.5px]" style={{ borderColor: c }} /></span>{t}</div>
          ))}
          <p className="px-2 pt-1 text-[11px] leading-snug text-text-tertiary">Lines carry moving dashes while work is handed on. A connection, channel or RAG index lights up when an agent calls it.</p>

          <div className={head}><span>Show</span></div>
          {([["groups", "Department boxes"], ["connectors", "Connections, channels, RAG"], ["security", "Security shields"], ["zones", "Network zones"], ["meshBadges", "Mesh badges"], ["meshEdges", "All mesh handoffs"], ["labels", "Names"], ["traffic", "Moving traffic"], ["retired", "Retired agents"]] as const).map(([k, label]) => (
            <label key={k} className={clsx(row, "cursor-pointer")}><input type="checkbox" checked={layers[k]} onChange={() => setLayers({ ...layers, [k]: !layers[k] })} className="accent-[#07191E]" /><span>{label}</span></label>
          ))}
        </div>
      )}
    </div>
  );
}
const Dot = ({ c, t }: { c: string; t: string }) => <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{t}</span>;
