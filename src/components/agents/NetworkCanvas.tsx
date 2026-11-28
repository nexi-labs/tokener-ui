"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Globe, Lock, Network as NetIcon, Pencil, Plus, Shield, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { useAgents } from "@/lib/agents/store";
import { assess, GRADE_COLOR, memberCounts, type AgentNetwork, type Posture } from "@/lib/agents/network";
import type { Agent } from "@/lib/agents/types";

/**
 * A canvas for one network, drawn the way a tunnel is in Cloudflare: the routes that reach it on the left, the network in the middle, the agents inside it, and what each agent
 * may call out to on the right. Lines are measured from the pills themselves, so the picture follows the layout at any width.
 * With no network it shows the agents that sit outside every network.
 */
type Tone = "good" | "info" | "warn" | "bad" | "muted" | "peer";
const TONE: Record<Tone, string> = { good: "#0E9F77", info: "#2563EB", warn: "#B7791F", bad: "#D14343", muted: "#8A94A0", peer: "#7C3AED" };

type Entry = { id: string; label: string; chip: string; tone: Tone; icon: "globe" | "users" | "net" | "lock"; connected: boolean; to?: string };
type Out = { id: string; agentId: string; label: string; tone: Tone; note?: string };
type Edge = { id: string; from: string; to: string; tone: Tone; dashed?: boolean };

const hostOf = (a: Agent) => a.network?.ingress.tls.hostname?.trim() || `${a.name}.agents.tokener.example`;
const gradeTone = (p: Posture): Tone => (p.grade === "A" || p.grade === "B" ? "good" : p.grade === "C" ? "warn" : "bad");

export function useEdges(deps: unknown[]) {
  const box = useRef<HTMLDivElement>(null); const nodes = useRef(new Map<string, HTMLElement>());
  const [geo, setGeo] = useState<{ w: number; h: number; pts: Map<string, { l: [number, number]; r: [number, number] }> }>({ w: 0, h: 0, pts: new Map() });
  const ref = useCallback((id: string) => (el: HTMLElement | null) => { if (el) nodes.current.set(id, el); else nodes.current.delete(id); }, []);
  const measure = useCallback(() => {
    const b = box.current; if (!b) return; const o = b.getBoundingClientRect(); const pts = new Map<string, { l: [number, number]; r: [number, number] }>();
    nodes.current.forEach((el, id) => { const r = el.getBoundingClientRect(); pts.set(id, { l: [r.left - o.left, r.top - o.top + r.height / 2], r: [r.right - o.left, r.top - o.top + r.height / 2] }); });
    setGeo({ w: o.width, h: o.height, pts });
  }, []);
  useLayoutEffect(() => { measure(); }, [measure, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const b = box.current; if (!b) return; const ro = new ResizeObserver(measure); ro.observe(b); window.addEventListener("resize", measure); return () => { ro.disconnect(); window.removeEventListener("resize", measure); }; }, [measure]);
  return { box, ref, geo };
}

export const curve = (a: [number, number], b: [number, number]) => { const dx = Math.max(24, (b[0] - a[0]) * 0.5); return `M ${a[0]} ${a[1]} C ${a[0] + dx} ${a[1]}, ${b[0] - dx} ${b[1]}, ${b[0]} ${b[1]}`; };

export function NetworkCanvas({ network, onEdit }: { network: AgentNetwork | null; onEdit?: (n: AgentNetwork) => void }) {
  const { agents, networks } = useAgents();
  const model = useMemo(() => {
    const live = agents.filter((a) => a.state !== "retired");
    const counts = memberCounts(Object.fromEntries(agents.map((a) => [a.id, a.network])));
    const members = live.filter((a) => (network ? a.network?.network === network.id : !a.network?.network));
    const posture = new Map(members.map((a) => [a.id, assess(a, a.network, networks, counts)]));
    const entries: Entry[] = []; const outs: Out[] = [];
    for (const a of members) {
      const p = posture.get(a.id)!;
      if (a.network?.reach === "public") entries.push({ id: `e_${a.id}`, label: hostOf(a), chip: p.grade === "A" || p.grade === "B" ? "Public, hardened" : p.grade === "C" ? "Public" : "Public, weak", tone: gradeTone(p), icon: "globe", connected: true, to: a.id });
      else if (!a.network) entries.push({ id: `e_${a.id}`, label: a.title, chip: "Not set up", tone: "muted", icon: "globe", connected: true, to: a.id });
      const e = a.network?.egress;
      outs.push(!e ? { id: `o_${a.id}`, agentId: a.id, label: "Not set up", tone: "muted" } : e.mode === "deny-all" ? { id: `o_${a.id}`, agentId: a.id, label: "Nothing leaves", tone: "good" }
        : e.mode === "allowlist" ? { id: `o_${a.id}`, agentId: a.id, label: `${e.rules.length} allowed`, tone: "info", note: e.viaGateway ? "via gateway" : undefined } : { id: `o_${a.id}`, agentId: a.id, label: "Anywhere", tone: "warn", note: e.dlp === "off" ? "no leak check" : undefined });
    }
    if (network) {
      if (members.some((a) => a.network?.reach === "internal")) entries.push({ id: "e_internal", label: "Your organisation", chip: "Signed in", tone: "info", icon: "users", connected: true });
      for (const pid of network.peers) { const peer = networks.find((n) => n.id === pid); if (!peer) continue; const k = agents.filter((a) => a.network?.network === pid && a.state !== "retired").length; entries.push({ id: `e_${pid}`, label: peer.name, chip: `Peered, ${k} ${k === 1 ? "agent" : "agents"}`, tone: "peer", icon: "net", connected: true }); }
      if (!entries.length) entries.push({ id: "e_closed", label: "Nothing from outside", chip: "Closed", tone: "good", icon: "lock", connected: false });
    }
    return { members, posture, entries, outs, rows: Math.max(entries.length + 1, members.length, 2) };
  }, [agents, networks, network]);

  const { box, ref, geo } = useEdges([model, network?.id]);
  const hubId = network ? "hub" : "hub_none";
  const edges: Edge[] = [
    ...model.entries.filter((e) => e.connected).map((e) => ({ id: e.id + "_h", from: e.id, to: hubId, tone: e.tone })),
    ...model.members.map((a) => ({ id: "h_" + a.id, from: hubId, to: "a_" + a.id, tone: gradeTone(model.posture.get(a.id)!) })),
    ...model.outs.map((o) => ({ id: o.id + "_l", from: "a_" + o.agentId, to: o.id, tone: o.tone })),
  ];
  const noNet = !network;

  return (
    <div ref={box} className="relative rounded-lg border border-border bg-surface-subtle overflow-x-auto" style={{ backgroundImage: "radial-gradient(rgb(var(--c-border)) 1px, transparent 1px)", backgroundSize: "14px 14px" }} data-testid="network-canvas">
      <div className="relative grid min-w-[880px] gap-x-10 gap-y-3 p-6 items-center" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.25fr) minmax(0,0.9fr)", gridTemplateRows: `auto repeat(${model.rows}, minmax(40px, auto))` }}>
        <svg className="absolute inset-0 pointer-events-none" width={geo.w} height={geo.h} aria-hidden>
          {edges.map((e) => { const a = geo.pts.get(e.from), b = geo.pts.get(e.to); if (!a || !b) return null; return <path key={e.id} d={curve(a.r, b.l)} fill="none" stroke={TONE[e.tone]} strokeOpacity={0.55} strokeWidth={1.6} strokeDasharray={e.dashed ? "4 4" : undefined} />; })}
        </svg>

        {["How callers arrive", noNet ? "Outside every network" : "The network", "Agents", "What each may call"].map((h, i) => <div key={h} className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary" style={{ gridColumn: i + 1, gridRow: 1 }}>{h}</div>)}

        {model.entries.map((e, i) => (
          <div key={e.id} style={{ gridColumn: 1, gridRow: i + 2 }} className="flex justify-end">
            <span ref={ref(e.id)} className={clsx("inline-flex max-w-full items-center rounded-full border bg-surface text-sm shadow-sm", e.connected ? "border-border-strong" : "border-dashed border-border")}>
              <span className="pl-3 pr-2 py-1.5 inline-flex items-center gap-1.5 min-w-0">{e.icon === "globe" ? <Globe size={13} className="shrink-0 text-text-tertiary" /> : e.icon === "users" ? <Users size={13} className="shrink-0 text-text-tertiary" /> : e.icon === "lock" ? <Lock size={13} className="shrink-0 text-text-tertiary" /> : <NetIcon size={13} className="shrink-0 text-text-tertiary" />}<span className="truncate">{e.label}</span></span>
              <span className="m-0.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap" style={{ color: TONE[e.tone], borderColor: TONE[e.tone] + "55", background: TONE[e.tone] + "14" }}>{e.chip}</span>
            </span>
          </div>
        ))}
        {network && onEdit && (
          <div style={{ gridColumn: 1, gridRow: model.entries.length + 2 }} className="flex justify-end">
            <button type="button" onClick={() => onEdit(network)} className="inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3.5 py-1.5 text-sm text-text-secondary hover:text-text-primary shadow-sm"><Plus size={14} />Change who can call in</button>
          </div>
        )}

        <div style={{ gridColumn: 2, gridRow: `2 / span ${model.rows}` }} className="flex items-center justify-center">
          <div ref={ref(hubId)} className="rounded-2xl border border-border-strong bg-surface px-4 py-3 shadow-card text-center min-w-[170px]">
            <div className="flex items-center justify-center gap-2 text-base font-semibold"><span className="h-7 w-7 rounded-md grid place-items-center bg-surface-muted">{noNet ? <Shield size={15} /> : <NetIcon size={15} />}</span>{noNet ? "No network" : network.name}</div>
            <div className="mt-1.5 text-xs text-text-tertiary">{noNet ? "Reached directly" : `${network.kind === "private" ? "Private" : "Shared"}, ${network.identity === "mtls" ? "certificates" : "signed tokens"}`}</div>
            <div className="mt-0.5 text-xs text-text-tertiary tabular-nums">{model.members.length} {model.members.length === 1 ? "agent" : "agents"}</div>
            {network && onEdit && <button type="button" onClick={() => onEdit(network)} className="mt-2 inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"><Pencil size={11} />Edit</button>}
          </div>
        </div>

        {model.members.map((a, i) => {
          const p = model.posture.get(a.id)!; const Ic = !p.configured ? Shield : p.grade === "D" || p.grade === "E" ? ShieldAlert : ShieldCheck; const color = !p.configured ? TONE.muted : GRADE_COLOR[p.grade!];
          return (
            <div key={a.id} style={{ gridColumn: 3, gridRow: i + 2 }}>
              <Link ref={ref("a_" + a.id)} href={`/agents/registry/${a.id}?tab=network`} className="inline-flex max-w-full items-center gap-2 rounded-full border border-border-strong bg-surface pl-2.5 pr-3.5 py-1.5 text-sm font-medium shadow-sm hover:border-text-tertiary" title={`${a.title}. ${p.label}`}>
                <Ic size={14} style={{ color }} className="shrink-0" /><span className="truncate">{a.title}</span>{p.grade && <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>{p.grade}</span>}
              </Link>
            </div>
          );
        })}

        {model.outs.map((o, i) => (
          <div key={o.id} style={{ gridColumn: 4, gridRow: i + 2 }}>
            <span ref={ref(o.id)} className="inline-flex items-center gap-1.5 rounded-full border bg-surface px-3 py-1.5 text-xs shadow-sm whitespace-nowrap" style={{ borderColor: TONE[o.tone] + "66" }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: TONE[o.tone] }} /><span className="font-medium">{o.label}</span>{o.note && <span className="text-text-tertiary">{o.note}</span>}
            </span>
          </div>
        ))}
        {model.members.length === 0 && <div style={{ gridColumn: "3 / span 2", gridRow: 2 }} className="text-sm text-text-tertiary">{noNet ? "Every agent is in a network." : "No agents in this network yet."}</div>}
      </div>
    </div>
  );
}
