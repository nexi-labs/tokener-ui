"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { CodeBlock, Confirm, Loading, Modal, Notice, fmtDate } from "@/components/mlops/ui";
import { toast } from "@/lib/mlops/toast";
import { ApiError } from "@/lib/api/client";
import type { AppSummary, TenantAdmin } from "@/lib/tenants/admin";

const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** The applications of one project: create one (its key is shown once) or disable one. Used by Tenant Management and API Keys. */
export function Applications({ api, projectId }: { api: TenantAdmin; projectId: string }) {
  const [rows, setRows] = useState<AppSummary[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ name: string; key: string } | null>(null);
  const [off, setOff] = useState<AppSummary | null>(null);
  const [rotate, setRotate] = useState<AppSummary | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let live = true;
    setRows(null); setProblem(null);
    api.applications(projectId).then((r) => { if (live) setRows(r); }).catch((e) => {
      if (!live) return;
      setProblem(e instanceof ApiError && e.status === 403 ? "Your role does not allow reading API keys here." : msg(e, "Applications could not be loaded."));
      setRows([]);
    });
    return () => { live = false; };
  }, [api, projectId, tick]);

  const create = async () => {
    setErr(null);
    try {
      const made = await api.createApplication(projectId, name.trim());
      setSecret({ name: made.app.name, key: made.apiKey });
      setAdding(false); setName(""); reload();
    } catch (e) { setErr(msg(e, "The application could not be created.")); }
  };

  const enable = async (a: AppSummary) => {
    try { await api.enableApplication(a.id); toast(`${a.name} enabled`); reload(); }
    catch (e) { toast(msg(e, "The application could not be enabled."), "error"); }
  };

  return (
    <div>
      {problem && <div className="mb-4"><Notice tone="warn">{problem}</Notice></div>}
      {rows === null ? <Loading /> : rows.length === 0 && !problem ? (
        <p className="text-sm text-text-secondary py-6">No applications in this project yet. Creating one issues its API key.</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-md">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{a.name}</div>
                <div className="text-xs text-text-tertiary mt-0.5">Created {fmtDate(a.createdAt)}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge tone={a.enabled ? "healthy" : "neutral"}>{a.enabled ? "Enabled" : "Disabled"}</Badge>
                <button className="text-sm font-medium text-text-primary hover:text-accent-700" onClick={() => setRotate(a)} aria-label={`Rotate the key of ${a.name}`}>Rotate key</button>
                {a.enabled
                  ? <button className="text-sm font-medium text-status-down hover:underline" onClick={() => setOff(a)} aria-label={`Disable ${a.name}`}>Disable</button>
                  : <button className="text-sm font-medium text-text-primary hover:text-accent-700" onClick={() => enable(a)} aria-label={`Enable ${a.name}`}>Enable</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5">
        {!adding ? <Button variant="secondary" onClick={() => setAdding(true)}><Plus size={14} /> New application</Button> : (
          <div className="rounded-md border border-border p-4 space-y-3">
            {err && <Notice tone="bad">{err}</Notice>}
            <Field label="Application name" hint="The workload that will call the platform, such as reply-drafter."><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setAdding(false); setName(""); setErr(null); }}>Cancel</Button>
              <Button variant="primary" disabled={!name.trim()} onClick={create}>Create and issue key</Button>
            </div>
          </div>
        )}
      </div>

      <Modal open={!!secret} onClose={() => setSecret(null)} title="Copy the key now" footer={<Button variant="primary" onClick={() => setSecret(null)}>I have stored it</Button>}>
        <div className="space-y-3">
          <Notice tone="warn" title="This is the only time the key is shown">The platform keeps only a hash of it, so it cannot be shown again. If it is lost, rotate the key.{api.mode === "sample" ? " This is a sample key and is not valid anywhere." : ""}</Notice>
          <p className="text-[13px] text-text-secondary">Key for <span className="font-medium text-text-primary">{secret?.name}</span></p>
          <CodeBlock code={secret?.key ?? ""} language="text" title="API key" maxHeight={80} />
        </div>
      </Modal>

      <Confirm open={!!rotate} onClose={() => setRotate(null)} danger title={`Rotate the key of ${rotate?.name}`} confirmLabel="Rotate key"
        body={<p>A new key is issued and shown once. The current key stops working at once, so anything still using it fails until it is given the new key.</p>}
        onConfirm={async () => {
          const target = rotate; setRotate(null);
          if (!target) return;
          try { setSecret({ name: target.name, key: await api.rotateKey(target.id) }); }
          catch (e) { toast(msg(e, "The key could not be rotated."), "error"); }
        }} />

      <Confirm open={!!off} onClose={() => setOff(null)} danger title={`Disable ${off?.name}`} confirmLabel="Disable"
        body={<p>Its key is refused on the next call. You can enable the application again later and it keeps the same key.</p>}
        onConfirm={async () => {
          const target = off; setOff(null);
          if (!target) return;
          try { await api.disableApplication(target.id); toast(`${target.name} disabled`); reload(); }
          catch (e) { toast(msg(e, "The application could not be disabled."), "error"); }
        }} />
    </div>
  );
}
