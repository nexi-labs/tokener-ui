"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { DISCOVER_KINDS, DISCOVER_MAX_LIMIT, type DiscoveryResult } from "@/lib/mlops/discovery";
import { mlops } from "@/lib/mlops/store";
import { Notice } from "./ui";

/** Browse what a connection can see in its target system. Read only. The kinds are the connector's own, so a person can type one that is not suggested. */
export function ConnectionDiscover({ connectionId, integrationId, sample }: { connectionId: string; integrationId: string; sample: boolean }) {
  const suggested = DISCOVER_KINDS[integrationId] ?? [];
  const [kind, setKind] = useState(suggested[0] ?? ""); const [ns, setNs] = useState(""); const [limit, setLimit] = useState("50");
  const [res, setRes] = useState<DiscoveryResult | null>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [asked, setAsked] = useState("");
  const go = async () => {
    setBusy(true); setErr(""); setRes(null);
    const n = limit.trim() === "" ? undefined : Number(limit);
    const r = await mlops.discoverConnection(connectionId, { kind, namespace: ns, limit: n });
    setBusy(false);
    if (r.ok) { setRes(r.result); setAsked(kind.trim()); } else setErr(r.error);
  };
  return (
    <div data-testid="discover" className="space-y-3">
      <div>
        <div className="text-[13px] font-semibold">What it can see</div>
        <p className="text-xs text-text-secondary mt-0.5">Lists what this connection can reach in its target. It only reads, so nothing is changed there.</p>
      </div>
      <div className="grid grid-cols-[1fr_1fr_84px] gap-2">
        <Field label="Kind" hint={suggested.length ? `For example ${suggested.join(", ")}` : "The connector's own name for it"}>
          <Input value={kind} onChange={(e) => setKind(e.target.value)} list={`kinds-${connectionId}`} placeholder="Deployment" />
          <datalist id={`kinds-${connectionId}`}>{suggested.map((k) => <option key={k} value={k} />)}</datalist>
        </Field>
        <Field label="Namespace" hint="Optional"><Input value={ns} onChange={(e) => setNs(e.target.value)} placeholder="ml-serving" /></Field>
        <Field label="Limit" hint={`Up to ${DISCOVER_MAX_LIMIT}`}><Input inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
      </div>
      <Button onClick={go} disabled={busy}><Search size={14} /> {busy ? "Looking" : "Look"}</Button>
      {err && <Notice tone="bad" title="Could not look">{err}</Notice>}
      {res && (
        <div className="space-y-2">
          {sample && <Notice tone="info">Sample result. Nothing was read from a real system.</Notice>}
          {res.items.length === 0 ? <p className="text-[13px] text-text-secondary">Nothing of kind {asked} was found{ns.trim() ? ` in ${ns.trim()}` : ""}.</p> : (
            <ul className="divide-y divide-border border border-border rounded-md">
              {res.items.map((i) => (
                <li key={`${i.ref.namespace}/${i.ref.name}`} className="px-3 py-2.5 text-[13px]">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium font-code text-xs break-all">{i.ref.name}</span><Badge tone="neutral">{i.ref.kind}</Badge></div>
                  {i.ref.namespace && <div className="text-xs text-text-tertiary mt-0.5">in {i.ref.namespace}</div>}
                  {Object.keys(i.attributes).length > 0 && <div className="text-xs text-text-secondary mt-1 flex flex-wrap gap-x-3 gap-y-0.5">{Object.entries(i.attributes).map(([k, v]) => <span key={k}>{k} <span className="text-text-primary">{v}</span></span>)}</div>}
                </li>
              ))}
            </ul>
          )}
          {res.truncated && <p className="text-xs text-text-tertiary">There are more than shown. Raise the limit or add a namespace to narrow it.</p>}
        </div>
      )}
    </div>
  );
}
