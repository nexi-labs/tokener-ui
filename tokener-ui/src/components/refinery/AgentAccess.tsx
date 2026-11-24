"use client";

import clsx from "clsx";
import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Field, Input, Toggle } from "@/components/ui/Form";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { Notice } from "@/components/mlops/ui";
import { Section } from "@/components/refinery/bits";
import { syncsToServer, useServerSetting } from "@/lib/refinery/settingsSync";
import { SettingSyncNote } from "@/components/refinery/SettingSyncNote";
import { agentAccessKey, MAX_ROWS_LIMIT, TOOL_INFO, applyPolicy, findings, loadPolicy, savePolicy, toolManifest, type AgentAccessPolicy, type AgentTool, type Exposure } from "@/lib/refinery/agentAccess";
import type { Dataset } from "@/lib/refinery/types";

const LEVELS: { value: Exposure; label: string; hint: string }[] = [
  { value: "expose", label: "Visible", hint: "Agents see the value." },
  { value: "mask", label: "Tokenised", hint: "Agents see a stable token. They can group and join on it but cannot read the value." },
  { value: "hide", label: "Hidden", hint: "The column does not exist for agents." },
];

export function AgentAccess({ dataset: d }: { dataset: Dataset }) {
  const [p, setP] = useState<AgentAccessPolicy>(() => loadPolicy(d));
  const [copied, setCopied] = useState(false);
  useEffect(() => { setP(loadPolicy(d)); }, [d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useServerSetting("datasets", d.id, "agent-access", agentAccessKey(d.id), () => setP(loadPolicy(d)));
  const change = (patch: Partial<AgentAccessPolicy>) => setP((cur) => { const next = { ...cur, ...patch }; savePolicy(d, next); return next; });
  const setCol = (name: string, v: Exposure) => change({ columns: { ...p.columns, [name]: v } });
  const toggleTool = (t: AgentTool) => change({ tools: p.tools.includes(t) ? p.tools.filter((x) => x !== t) : [...p.tools, t] });

  const view = useMemo(() => applyPolicy(p, d), [p, d]);
  const notes = useMemo(() => findings(p, d.profile.columns, d.sample), [p, d.profile.columns, d.sample]);
  const manifest = useMemo(() => JSON.stringify(toolManifest(d, p), null, 2), [p, d]);
  const prof = (n: string) => d.profile.columns.find((c) => c.name === n);
  const shown = view.rows.slice(0, 8);

  return (
    <div className="space-y-4">
      <Notice title="Agents reach this dataset only through tools">
        An AI agent does not read the dataset. It calls the tools below, and this policy decides what they can return. Nothing is visible to agents until you switch access on and allow a client.
        {syncsToServer() ? "The policy is saved on the server." : "The policy is saved in this browser."} The endpoint that serves the tools, and the log of every call, are not connected yet.
      </Notice>
      <SettingSyncNote />

      <div className="grid lg:grid-cols-2 gap-4">
        <Section title="Access policy" hint="Off by default">
          <div className="space-y-4">
            <Toggle checked={p.enabled} onChange={(v) => change({ enabled: v })} label="Allow agents to use this dataset" description="Switches the tools on for the clients you allow." />
            <Field label="Purpose" hint="Why agents need this data. It will be recorded with every call."><Input value={p.purpose} onChange={(e) => change({ purpose: e.target.value })} placeholder="For example: answer support questions about order history" /></Field>
            <Field label="Allowed clients" hint="Agent or client names, separated by commas."><Input value={p.clients.join(", ")} onChange={(e) => change({ clients: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="support-assistant, analytics-agent" /></Field>
            <Field label="Most rows per call" hint={`Between 1 and ${MAX_ROWS_LIMIT}. Applies to the sample tool.`}><Input type="number" min={1} max={MAX_ROWS_LIMIT} value={p.maxRows} onChange={(e) => change({ maxRows: Math.min(MAX_ROWS_LIMIT, Math.max(1, Number(e.target.value) || 1)) })} /></Field>
            <div>
              <div className="text-[13px] font-medium text-text-primary mb-2">Tools</div>
              <ul className="space-y-2">
                {(Object.keys(TOOL_INFO) as AgentTool[]).map((t) => (
                  <li key={t}><label className="flex items-start gap-2.5 text-[13px] cursor-pointer"><input type="checkbox" checked={p.tools.includes(t)} onChange={() => toggleTool(t)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#02F5A1]" /><span><span className="font-medium text-text-primary">{TOOL_INFO[t].label}</span><span className="block text-text-secondary">{TOOL_INFO[t].blurb}</span></span></label></li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <div className="space-y-4">
          <Section title="Review" hint="Updates as you change the policy">
            <ul className="space-y-2">
              {notes.length === 0 && <li className="text-[13px] text-text-secondary">Nothing to flag.</li>}
              {notes.map((n, i) => (<li key={i}><Notice tone={n.level === "bad" ? "bad" : n.level === "warn" ? "warn" : "ok"}>{n.text}</Notice></li>))}
            </ul>
          </Section>
          <Section title="Tool definitions" hint="Model Context Protocol, as the endpoint will offer them" action={
            <button onClick={() => { void navigator.clipboard?.writeText(manifest).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border-strong text-xs hover:bg-surface-muted">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}</button>}>
            <pre className="max-h-72 overflow-auto rounded-md bg-[#07191E] text-[#D6F5E9] text-[11.5px] leading-relaxed p-3.5 font-code" aria-label="Tool definitions">{manifest}</pre>
          </Section>
        </div>
      </div>

      <Section title="Columns" hint="What each column is to an agent">
        <Table>
          <Thead><tr><Th>Column</Th><Th>Type</Th><Th>Flags</Th><Th>Agents see</Th></tr></Thead>
          <tbody>
            {d.columns.map((c) => (
              <Tr key={c.name}>
                <Td className="font-code text-xs">{c.name}</Td>
                <Td className="text-text-secondary">{c.type}</Td>
                <Td><span className="inline-flex gap-1.5">{prof(c.name)?.pii && <Badge tone="down">Personal data</Badge>}{c.role === "identifier" && <Badge tone="neutral">Identifier</Badge>}{c.role === "label" && <Badge tone="info">Label</Badge>}</span></Td>
                <Td>
                  <div role="radiogroup" aria-label={`Exposure of ${c.name}`} className="inline-flex rounded-md border border-border-strong overflow-hidden">
                    {LEVELS.map((l) => (
                      <button key={l.value} role="radio" aria-checked={p.columns[c.name] === l.value} title={l.hint} onClick={() => setCol(c.name, l.value)}
                        className={clsx("h-8 px-3 text-xs border-l first:border-l-0 border-border-strong", p.columns[c.name] === l.value ? (l.value === "hide" ? "bg-[#07191E] text-white" : l.value === "mask" ? "bg-[#DDF7EC] text-[#07191E] font-medium" : "bg-[#02F5A1] text-[#07191E] font-medium") : "bg-surface text-text-secondary hover:bg-surface-muted")}>{l.label}</button>
                    ))}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <Section title="What an agent would receive" hint={`${shown.length} of ${view.rows.length} rows returned by one sample call${view.truncated ? `, capped at ${p.maxRows}` : ""}. Computed from the stored sample rows.`}>
        {view.columns.length === 0 ? <p className="text-[13px] text-text-secondary">Every column is hidden, so there is nothing to return.</p> : (
          <div className="overflow-x-auto">
            <Table>
              <Thead><tr>{view.columns.map((c) => <Th key={c.name}>{c.name}{c.exposure === "mask" ? " (token)" : ""}</Th>)}</tr></Thead>
              <tbody>{shown.map((r, i) => (<Tr key={i}>{view.columns.map((c) => <Td key={c.name} className={clsx("text-xs whitespace-nowrap max-w-[220px] truncate", c.exposure === "mask" && "font-code text-text-secondary")}>{r[c.name] === null || r[c.name] === undefined ? "" : String(r[c.name])}</Td>)}</Tr>))}</tbody>
            </Table>
          </div>
        )}
        {view.hidden.length > 0 && <p className="mt-3 text-xs text-text-tertiary">Hidden from agents: {view.hidden.join(", ")}.</p>}
      </Section>
    </div>
  );
}
