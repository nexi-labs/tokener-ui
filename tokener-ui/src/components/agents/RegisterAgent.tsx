"use client";

import Link from "next/link";
import { useState } from "react";
import { Modal, Notice } from "@/components/mlops/ui";
import { Button } from "@/components/ui/Button";
import { OrgPlacement, OwnerSelect, noPlace, type OrgPlace } from "@/components/org/OrgSelect";
import { Field, Input, Select } from "@/components/ui/Form";
import { ADAPTERS } from "@/lib/agents/adapters";
import { agents } from "@/lib/agents/store";
import { CONTROL_HELP, CONTROL_LABEL, type ControlLevel, type Risk } from "@/lib/agents/types";
import { toast } from "@/lib/mlops/toast";

const LEVELS: ControlLevel[] = ["governed", "observed", "inventory"];

/** Registers an agent that already runs somewhere else. It becomes an entry in the registry with an owner. How much tok∑ner can do with it depends on the control level. */
export function RegisterAgent({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: (id: string) => void }) {
  const [f, setF] = useState({ name: "", title: "", description: "", owner: "", framework: "http-agent", endpoint: "", control: "inventory" as ControlLevel, risk: "medium" as Risk });
  const [place, setPlace] = useState<OrgPlace>(noPlace);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => {
    const r = agents.register({ ...f, department: place.department, project: place.project });
    if (!r.ok) { setErr(r.error); return; }
    toast(`${r.value.title} is registered`, "success"); setErr(""); onClose(); onDone?.(r.value.id);
  };
  const groups = [["Frameworks and platforms", ADAPTERS.filter((a) => a.kind !== "protocol" && a.connect)], ["Open protocols", ADAPTERS.filter((a) => a.kind === "protocol")]] as const;
  return (
    <Modal open={open} onClose={onClose} title="Register an existing agent" wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Register agent</Button></>}>
      <div className="space-y-4">
        <p className="text-text-secondary">For an agent that already runs on another platform. To build a new one that tok∑ner can fully control, use <Link href="/agents/forge" className="underline">Agent Forge</Link>.</p>
        {err && <Notice tone="bad">{err}</Notice>}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Name" hint="Lowercase letters, digits and hyphens. It becomes the agent address."><Input value={f.name} onChange={(e) => set("name", e.target.value.toLowerCase())} placeholder="claims-intake" /></Field>
          <Field label="Display name"><Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Claims intake" /></Field>
        </div>
        <Field label="What it is for"><Input value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Collects claim details and checks them for completeness." /></Field>
        <OrgPlacement value={place} onChange={setPlace} />
        <OwnerSelect value={f.owner} onChange={(v) => set("owner", v)} hint="A group or person from People and access who answers for this agent." />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Where it runs">
            <Select value={f.framework} onChange={(e) => set("framework", e.target.value)}>
              {groups.map(([g, list]) => <optgroup key={g} label={g}>{list.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>)}
            </Select>
          </Field>
          <Field label="Address" hint="Where tok∑ner can reach it. Credentials are added when you connect it, as secret references."><Input value={f.endpoint} onChange={(e) => set("endpoint", e.target.value)} placeholder="https://agent.example.com" /></Field>
        </div>
        <Field label="Risk class" hint="How much harm a wrong action could do. It decides who must approve changes."><Select value={f.risk} onChange={(e) => set("risk", e.target.value as Risk)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></Select></Field>
        <fieldset>
          <legend className="text-[13px] font-medium mb-2">How much can tok∑ner do with it</legend>
          <div className="space-y-2">
            {LEVELS.map((l) => (
              <label key={l} className={`flex items-start gap-3 rounded-md border px-3 py-2.5 cursor-pointer ${f.control === l ? "border-emph bg-surface-subtle" : "border-border hover:bg-surface-subtle"}`}>
                <input type="radio" name="control" checked={f.control === l} onChange={() => set("control", l)} className="mt-1" />
                <span><span className="block text-sm font-medium">{CONTROL_LABEL[l]}</span><span className="block text-xs text-text-secondary mt-0.5">{CONTROL_HELP[l]}</span></span>
              </label>
            ))}
          </div>
          {f.control === "governed" && <p className="text-xs text-text-tertiary mt-2">Only choose Governed once the agent calls models and tools through the tok∑ner gateways. Otherwise the registry would claim control it does not have.</p>}
        </fieldset>
      </div>
    </Modal>
  );
}
