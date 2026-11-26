"use client";

import clsx from "clsx";
import { Building2, Globe2, Lock, ShieldAlert, ShieldCheck, ShieldOff, type LucideIcon } from "lucide-react";
import { GRADE_COLOR, REACH, SEVERITY_LABEL, type Posture, type Reach, type Severity } from "@/lib/agents/network";

export const REACH_ICON: Record<Reach, LucideIcon> = { private: Lock, internal: Building2, public: Globe2 };
export const SEVERITY_COLOR: Record<Severity, string> = { critical: "#D14343", high: "#D9822B", medium: "#B7791F", low: "#6B7480", good: "#0E9F77" };
/** The colour of a posture: its grade's, or grey when nothing is set up. */
export const postureColor = (p: Posture) => (p.grade ? GRADE_COLOR[p.grade] : "#6B7480");
export const PostureIcon = ({ p, size = 14 }: { p: Posture; size?: number }) => (!p.configured ? <ShieldOff size={size} /> : p.grade === "D" || p.grade === "E" ? <ShieldAlert size={size} /> : <ShieldCheck size={size} />);

/** A short pill: shield, grade and what it is called. Used in lists and headers, so the same word means the same thing everywhere. */
export function PostureBadge({ p, compact }: { p: Posture; compact?: boolean }) {
  const c = postureColor(p);
  return (
    <span title={p.configured ? `Network security: ${p.label}, ${p.score} of 100` : "No network setup. Anyone in the organisation can reach this agent."}
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap" style={{ color: c, borderColor: `${c}55`, background: `${c}14` }}>
      <PostureIcon p={p} size={12} />{p.configured ? (compact ? p.grade : `${p.label}`) : "Not set up"}
    </span>
  );
}

export function ReachPill({ reach }: { reach: Reach | null }) {
  if (!reach) return <span className="text-xs text-text-tertiary">Open to the organisation</span>;
  const I = REACH_ICON[reach];
  return <span className="inline-flex items-center gap-1.5 text-[13px] text-text-secondary"><I size={14} />{REACH.find((r) => r.id === reach)!.label}</span>;
}

/** The score as a ring with the grade in the middle. */
export function PostureRing({ p, size = 84 }: { p: Posture; size?: number }) {
  const c = postureColor(p); const r = size / 2 - 7; const len = 2 * Math.PI * r; const frac = p.configured ? p.score / 100 : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={p.configured ? `Network security ${p.score} out of 100, grade ${p.grade}` : "Not set up"}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--c-border))" strokeWidth={7} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth={7} strokeLinecap="round" strokeDasharray={`${len * frac} ${len}`} style={{ transition: "stroke-dasharray .4s" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <div><div className="text-2xl font-semibold tabular-nums" style={{ color: c }}>{p.grade ?? "–"}</div>{p.configured && <div className="text-[10px] text-text-tertiary mt-1 tabular-nums">{p.score}/100</div>}</div>
      </div>
    </div>
  );
}

export function SeverityChip({ s }: { s: Severity }) {
  return <span className={clsx("inline-flex h-5 items-center rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide")} style={{ color: SEVERITY_COLOR[s], background: `${SEVERITY_COLOR[s]}18` }}>{SEVERITY_LABEL[s]}</span>;
}
