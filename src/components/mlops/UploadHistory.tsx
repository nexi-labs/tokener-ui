"use client";

import { Ban, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Confirm, GuardButton, Loading, Notice, fmtMb, relTime, useRole } from "@/components/mlops/ui";
import { mlops } from "@/lib/mlops/store";
import { toast } from "@/lib/mlops/toast";
import { MAX_OPEN_PER_PERSON, SESSION_HOURS, STATUS_LABEL, STATUS_TONE, canAbort, inProgress, leftText, minutesLeft, type UploadRecord } from "@/lib/mlops/uploads";

/**
 * What the server keeps of every model upload: what was declared, what arrived and what the inspection found. An upload that nobody finishes can be
 * aborted here, and the server closes one by itself after 24 hours. `library` reads the platform library's uploads instead of the organisation's.
 */
export function UploadHistory({ library = false, sample = false }: { library?: boolean; sample?: boolean }) {
  const role = useRole();
  const [list, setList] = useState<UploadRecord[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [abort, setAbort] = useState<UploadRecord | null>(null);
  const load = useCallback(async () => {
    const r = await mlops.listUploads(library);
    if (r.ok) { setList(r.uploads); setErr(""); } else setErr(r.error);
  }, [library]);
  useEffect(() => { void load(); }, [load]);
  if (err) return <Notice tone="bad" title="Uploads could not be read">{err}</Notice>;
  if (!list) return <Loading />;
  const busy = inProgress(list).length;
  const now = Date.now();
  const stop = async () => {
    const r = await mlops.abortUpload(abort!.id, library);
    if (r.ok) toast(`${abort!.fileName} was aborted`); else toast(r.error, "error");
    await load();
  };
  return (
    <div data-testid="upload-history"><Card>
      <CardHeader title="Uploads" subtitle={`${list.length} on record. ${busy ? `${busy} waiting for a file.` : "None are waiting."} A person can have ${MAX_OPEN_PER_PERSON} in progress, and one nobody finishes closes after ${SESSION_HOURS} hours.`} />
      <CardBody>
        {sample && <Notice tone="info" title="Sample records">Two older records are shown so you can see what the server keeps. A sample upload finishes at once, so a new one appears here as accepted.</Notice>}
        {list.length === 0 ? <p className="text-sm text-text-secondary">No uploads yet. Upload a model file and its record appears here with what the inspection found.</p> : (
          <ul className="divide-y divide-border mt-1">
            {list.map((u) => {
              const left = minutesLeft(u, now); const isOpen = open === u.id; const detail = u.findings.length > 0 || u.summary !== "";
              return (
                <li key={u.id} className="py-3">
                  <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge tone={STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge>
                        <span className="font-medium text-sm">{u.modelName}</span>
                        {u.version != null && (library ? <span className="text-sm text-text-secondary">v{u.version}</span> : <Link href="/mlops/models" className="text-sm underline underline-offset-2">v{u.version}</Link>)}
                      </div>
                      <div className="text-xs text-text-tertiary mt-1">
                        {u.fileName} · {u.format} · <span className="tabular-nums">{fmtMb(u.declaredBytes / 1048576)}</span> · {u.createdBy || "unknown"} · started {relTime(u.createdAt)}
                        {left != null && <> · closes in {leftText(left)}</>}
                      </div>
                      {detail && (
                        <button type="button" className="mt-1.5 inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : u.id)}>
                          {isOpen ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />} {u.summary || "Inspection findings"}
                        </button>
                      )}
                      {isOpen && (
                        <div className="mt-2 rounded-lg bg-surface-subtle px-3 py-2.5 text-xs text-text-secondary space-y-1.5">
                          {u.findings.map((f) => <div key={f}>{f}</div>)}
                          {u.sha256 && <div className="font-code text-[11px] text-text-tertiary break-all">sha256 {u.sha256}</div>}
                          <div className="text-text-tertiary">{u.framework} · {u.task} · license {u.license}</div>
                        </div>
                      )}
                    </div>
                    <div>
                      {canAbort(u) && (library
                        ? <Button variant="secondary" className="h-8" onClick={() => setAbort(u)}><Ban size={13} aria-hidden /> Abort</Button>
                        : <GuardButton action="model.register" role={role} variant="secondary" className="h-8" onClick={() => setAbort(u)}><Ban size={13} aria-hidden /> Abort</GuardButton>)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
      <Confirm open={!!abort} onClose={() => setAbort(null)} danger confirmLabel="Abort upload" title={abort ? `Abort ${abort.fileName}` : ""}
        body={<p>The upload is cancelled and anything already received is deleted. Nothing is added to the registry. You can start the upload again later.</p>} onConfirm={stop} />
    </Card></div>
  );
}
