"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal, Notice } from "@/components/mlops/ui";
import { useCrucibleCan } from "@/lib/crucible/live/store";

/** A button that is off, with the reason as its tooltip, when the server did not grant the person the permission. The server checks again on every call. */
export function Allowed({ need, onClick, children, variant = "secondary", disabled, className }: { need: string; onClick: () => void; children: React.ReactNode; variant?: "primary" | "secondary" | "ghost"; disabled?: boolean; className?: string }) {
  const can = useCrucibleCan(); const ok = can(need);
  return (
    <span title={ok ? undefined : "Your role in this organisation does not allow this."} className="inline-flex">
      <Button variant={variant} disabled={!ok || disabled} onClick={onClick} className={className}>{children}</Button>
    </span>
  );
}

/** Shows a key's token once. It is not kept anywhere after this closes, on the server or in the browser. */
export function TokenDialog({ token, name, onClose }: { token: string | null; name: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(token ?? ""); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the person can select it */ } };
  return (
    <Modal open={token !== null} onClose={onClose} title={`Key ${name}`} footer={<Button variant="primary" onClick={onClose}>I have saved it</Button>}>
      <div className="space-y-3">
        <Notice tone="warn" title="This is the only time the key is shown">Copy it into your secret manager now. Only a fingerprint is kept, so it cannot be shown again. If it is lost, rotate the key.</Notice>
        <div className="flex items-center gap-2">
          <code className="flex-1 font-code text-xs break-all rounded-md border border-border-strong bg-surface-muted px-3 py-2 select-all">{token}</code>
          <Button variant="secondary" onClick={copy} aria-label="Copy the key">{copied ? <Check size={14} /> : <Copy size={14} />}</Button>
        </div>
      </div>
    </Modal>
  );
}

export const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never");
export const person = (s: string) => (s.includes("@") ? s.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : s);
export const STORE_LABEL: Record<string, string> = { s3: "Amazon S3", minio: "MinIO", gcs: "Google Cloud Storage", azure: "Azure Blob Storage", r2: "Cloudflare R2" };
export const AUTH_LABEL: Record<string, string> = { "iam-role": "Cross account role", "access-key": "Access key", "workload-identity": "Workload identity", "service-account": "Service account" };
export const SCOPE_LABEL: Record<string, string> = { log: "Log runs and artifacts", read: "Read runs and datasets", register: "Register models" };
