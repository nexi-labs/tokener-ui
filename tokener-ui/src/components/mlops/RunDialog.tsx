"use client";

import clsx from "clsx";
import { FlaskConical, Play, Server } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Form";
import { OP_BY_KIND } from "@/lib/mlops/operators";
import { RealModeUnavailable } from "@/lib/mlops/runtime";
import type { Connection, Env } from "@/lib/mlops/types";
import { ENV_LABEL } from "@/lib/mlops/types";
import type { PipelineSpec } from "@/lib/mlops/spec";
import type { Issue } from "@/components/studio/types";
import { Modal, Notice } from "./ui";
import { ReviewPanel } from "./ReviewPanel";

export type RunChoice =
  | { kind: "simulate"; source: "draft" | "published"; injectAt: string }
  | { kind: "environment" };

type Props = {
  open: boolean;
  onClose: () => void;
  name: string;
  env: Env;
  draft: PipelineSpec;
  published: { version: number; spec: PipelineSpec } | undefined;
  /** True when the draft differs from the latest published version. */
  dirty: boolean;
  issues: Issue[];
  blockers: string[];
  connections: Connection[];
  /** Whether this workspace can reach real infrastructure at all. */
  live: boolean;
  onStart: (c: RunChoice) => void;
};

/**
 * The one place a pipeline is started from. Simulation is free, needs no payment method and can run the working draft, so a pipeline can be
 * tried while it is being built. Running in an environment executes a published version against the connections of that environment, is
 * metered, and therefore needs a payment method on the organization once the free start no longer covers it.
 */
export function RunDialog({ open, onClose, name, env, draft, published, dirty, issues, blockers, connections, live, onStart }: Props) {
  const [kind, setKind] = useState<"simulate" | "environment">("simulate");
  const [source, setSource] = useState<"draft" | "published">(published && !dirty ? "published" : "draft");
  const [injectAt, setInjectAt] = useState("");

  const spec = source === "published" && published ? published.spec : draft;
  const draftBlockers = blockers;

  const envBlock =
    kind === "environment"
      ? !published ? "Publish a version first. Only published versions run against an environment."
        : dirty ? "You have unpublished changes. Publish them, or run the published version after discarding them."
        : !live ? new RealModeUnavailable().message
        : null
      : null;

  const cant = kind === "simulate" ? (draftBlockers.length ? draftBlockers.slice(0, 3).join(". ") + "." : null) : envBlock ?? (draftBlockers.length ? draftBlockers.slice(0, 3).join(". ") + "." : null);
  const title = `Run ${name}`;

  const Card = ({ id, icon: Icon, head, tag, body }: { id: "simulate" | "environment"; icon: typeof Play; head: string; tag: string; body: string }) => (
    <button type="button" role="radio" aria-checked={kind === id} onClick={() => setKind(id)}
      className={clsx("text-left rounded-lg border p-4 transition-colors", kind === id ? "border-accent-600 bg-accent-50/40" : "border-border hover:border-border-strong bg-surface")}>
      <div className="flex items-center gap-2.5">
        <span className="h-8 w-8 rounded-md bg-surface-muted grid place-items-center"><Icon size={16} /></span>
        <span className="text-[13px] font-semibold flex-1">{head}</span>
        <span className="text-[11px] uppercase tracking-wide text-text-tertiary">{tag}</span>
      </div>
      <p className="text-[13px] text-text-secondary mt-2">{body}</p>
    </button>
  );

  return (
    <>
      <Modal open={open} onClose={onClose} wide title={title}
        footer={<><Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!!cant} onClick={() => onStart(kind === "simulate" ? { kind, source, injectAt } : { kind })}>
            <Play size={14} /> {kind === "simulate" ? "Start simulation" : `Run in ${ENV_LABEL[env]}`}
          </Button></>}>
        <div className="space-y-4">
          <div role="radiogroup" aria-label="How to run" className="grid sm:grid-cols-2 gap-3">
            <Card id="simulate" icon={FlaskConical} head="Simulate" tag="Free" body="Walks every operator in order with generated data. Nothing is contacted and nothing is charged. Works on your draft, so you can try a pipeline while you build it." />
            <Card id="environment" icon={Server} head={`Run in ${ENV_LABEL[env]}`} tag="Metered" body="Executes the published version against the connections of this environment, with their stored credentials. Billed by what it consumes." />
          </div>

          {kind === "simulate" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="What to simulate">
                <Select value={source} onChange={(e) => setSource(e.target.value as "draft" | "published")}>
                  <option value="draft">Working draft{dirty ? " (unpublished changes)" : ""}</option>
                  {published && <option value="published">Published version {published.version}</option>}
                </Select>
              </Field>
              <Field label="Inject a failure" hint="Shows retries, failure handling and automatic rollback.">
                <Select value={injectAt} onChange={(e) => setInjectAt(e.target.value)}>
                  <option value="">No failure</option>
                  {spec.nodes.filter((n) => OP_BY_KIND[n.operator]?.executable !== "none").map((n) => <option key={n.id} value={n.id}>Fail at {n.name}</option>)}
                </Select>
              </Field>
            </div>
          )}

          {kind === "environment" && (
            <div className="space-y-3">
              {envBlock && <Notice tone={!live ? "info" : "warn"}>{envBlock}</Notice>}
              {!envBlock && <p className="text-xs text-text-tertiary">Running in an environment is metered. If this organization has no payment method yet, you are asked for one when you start the run. Simulation never is.</p>}
              {!envBlock && <p className="text-xs text-text-secondary">Runs version {published?.version} in {ENV_LABEL[env]}. Steps that change anything pause for approval where your settings require it. {env === "production" ? "Production: the approval gate pauses the run until an approver decides." : ""}</p>}
            </div>
          )}

          {cant && kind === "simulate" && <Notice tone="bad" title="This pipeline cannot run yet">{cant}</Notice>}
          <ReviewPanel spec={spec} issues={issues} connections={connections} initial="plan" />
        </div>
      </Modal>
    </>
  );
}
