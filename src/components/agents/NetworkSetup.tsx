"use client";

import clsx from "clsx";
import Link from "next/link";
import { useMemo } from "react";
import { Check } from "lucide-react";
import { Select } from "@/components/ui/Form";
import { SENSITIVE, useAgents } from "@/lib/agents/store";
import { assess, memberCounts, presetConfig, validateNetwork, type NetworkConfig, type PresetId } from "@/lib/agents/network";
import type { ControlLevel, ToolGrant } from "@/lib/agents/types";
import { PostureBadge, REACH_ICON, SeverityChip } from "./NetworkBits";

type Subject = { name: string; control: ControlLevel; models: string[]; tools: { server: string; allow: string[] }[] };
const CHOICES: { id: PresetId | "none"; label: string; blurb: string; icon?: "private" | "internal" | "public" }[] = [
  { id: "none", label: "No setup", blurb: "Open to anyone in your organisation, and free to call anywhere. Set it up later if you need to." },
  { id: "private", label: "Private network", blurb: "Closed to everything outside a named network. Certificates between members.", icon: "private" },
  { id: "internal", label: "Internal", blurb: "Your organisation only, signed in. Outbound limited to what the agent uses.", icon: "internal" },
  { id: "public", label: "Public, hardened", blurb: "Open to the internet behind identity, limits and the shield.", icon: "public" },
];

/**
 * The security choice when an agent is created or enrolled. A starting point, not a final answer: every setting can be changed afterwards in the agent's Network tab.
 * The choice is judged as the person makes it, so they see the grade it earns and what is still open before they commit.
 */
export function NetworkSetup({ subject, value, onChange }: { subject: Subject; value: NetworkConfig | undefined; onChange: (v: NetworkConfig | undefined) => void }) {
  const { networks, agents } = useAgents();
  const agent = useMemo(() => ({
    name: subject.name || "new-agent", control: subject.control, models: subject.models,
    tools: subject.tools.flatMap((t) => t.allow.map((tool): ToolGrant => ({ server: t.server, tool, sensitive: SENSITIVE.test(tool), approval: false }))),
  }), [subject]);
  const cfgs = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, a.network])), [agents]);
  const posture = useMemo(() => assess(agent, value, networks, memberCounts({ ...cfgs, __new: value })), [agent, value, networks, cfgs]);
  const issues = useMemo(() => (value ? validateNetwork(value, agent, networks) : []), [value, agent, networks]);
  const current: PresetId | "none" = !value ? "none" : value.reach === "private" ? "private" : value.reach === "internal" ? "internal" : "public";
  const pick = (id: PresetId | "none") => onChange(id === "none" ? undefined : presetConfig(id, agent, "jdoe@example.com", id === "private" ? (value?.network ?? networks.find((n) => n.kind === "private")?.id) : value?.network));
  const worst = posture.findings.filter((f) => f.severity !== "good").slice(0, 2);

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-2.5" role="radiogroup" aria-label="Network security">
        {CHOICES.map((c) => { const on = current === c.id; const I = c.icon ? REACH_ICON[c.icon] : null; return (
          <button key={c.id} type="button" role="radio" aria-checked={on} onClick={() => pick(c.id)} className={clsx("text-left rounded-lg border px-3.5 py-3 transition-colors", on ? "border-emph bg-surface-subtle ring-1 ring-emph" : "border-border hover:bg-surface-subtle")}>
            <div className="flex items-center gap-2 text-sm font-semibold">{I && <I size={15} />}{c.label}{c.id === "public" && <span className="text-[10px] font-semibold uppercase tracking-wide text-status-healthy">Recommended for public</span>}{on && <Check size={14} className="ml-auto" />}</div>
            <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">{c.blurb}</p>
          </button>); })}
      </div>

      {value?.reach === "private" && (
        <div>
          <label className="block text-[13px] font-medium mb-1.5" htmlFor="setup-net">Network</label>
          <Select id="setup-net" value={value.network ?? ""} onChange={(e) => onChange({ ...value, network: e.target.value || undefined })}>
            <option value="">Choose a network</option>{networks.map((n) => <option key={n.id} value={n.id}>{n.name} ({n.kind})</option>)}
          </Select>
          <p className="text-xs text-text-tertiary mt-1.5">Only its members, and networks peered with it, can call this agent. Make a new one in <Link href="/agents/networks" className="underline" target="_blank">Agent networks</Link>.</p>
        </div>)}

      {value && (
        <div className="rounded-lg border border-border bg-surface-subtle p-3.5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap"><span className="text-[13px] font-medium">Result</span><PostureBadge p={posture} /><span className="text-xs text-text-tertiary tabular-nums">{posture.score} of 100</span></div>
          <ul className="text-xs text-text-secondary space-y-1 list-disc pl-4">
            <li>{value.reach === "public" ? `Callers prove who they are (${value.ingress.auth.length} ways), within ${value.ingress.rate.perMin} calls a minute.` : value.reach === "private" ? "Members prove who they are with certificates." : "Callers sign in with your organisation identity."}</li>
            <li>{value.ingress.shield.injection === "block" ? "Prompt injection is blocked at the edge." : "Prompt injection is not blocked."}</li>
            <li>{value.egress.mode === "allowlist" ? `Outbound calls are limited to ${value.egress.rules.length} ${value.egress.rules.length === 1 ? "destination" : "destinations"}: what it already uses.` : value.egress.mode === "deny-all" ? "It cannot call out." : "It may call anywhere."}</li>
            {subject.control !== "governed" && <li>It runs elsewhere, so the origin is locked to the tok∑ner edge. Outbound rules apply once it calls through the gateway.</li>}
          </ul>
          {issues.filter((i) => i.level === "error").map((i, n) => <p key={n} className="text-xs text-status-down">{i.message}</p>)}
          {worst.length > 0 && <div className="space-y-1.5 pt-1">{worst.map((f) => <div key={f.id} className="flex items-start gap-2 text-xs"><SeverityChip s={f.severity} /><span className="text-text-secondary pt-0.5">{f.title}. {f.fix}</span></div>)}</div>}
        </div>)}
      <p className="text-xs text-text-tertiary">This is a starting point. Every setting can be changed later in the agent&apos;s Network tab.</p>
    </div>
  );
}
