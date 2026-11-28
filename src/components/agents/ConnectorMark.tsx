"use client";

import { NodeIcon } from "@/components/studio/icons";
import { iconFor, resolve, type Hub, type ResourceKind } from "@/lib/agents/connectors";

/** The brand mark of a connection, channel or RAG index, taken from the catalogue so it matches Integrations. */
export function ConnectorMark({ iconKey, integrationId, size = 16, box = 28 }: { iconKey: string; integrationId?: string; size?: number; box?: number }) {
  return <span className="grid place-items-center rounded-md bg-surface-muted shrink-0" style={{ width: box, height: box }}><NodeIcon icon={iconFor({ iconKey, integrationId })} size={size} /></span>;
}

/** A resource named by its key, connection:<id>, channel:<id> or knowledge:<id>. */
export function parseKey(key: string): { kind: ResourceKind; ref: string } | null {
  const i = key.indexOf(":"); if (i < 0) return null;
  const kind = key.slice(0, i) as ResourceKind; return kind === "connection" || kind === "channel" || kind === "knowledge" ? { kind, ref: key.slice(i + 1) } : null;
}
export function resolveKey(key: string, hub: Hub) {
  const p = parseKey(key); if (!p) return null;
  return resolve({ id: key, kind: p.kind, ref: p.ref, role: "notify", origin: "declared" }, hub);
}
