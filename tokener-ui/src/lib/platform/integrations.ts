"use client";

import { useSyncExternalStore } from "react";
import { INTEGRATIONS, setIntegrationSource } from "@/lib/mlops/catalog";
import type { IntegrationDef } from "@/lib/mlops/types";
import { publishedConnectors, useCatalogueState, overrideFor, publishedById, catalogueSnapshotKey } from "./connector-catalogue";

type Snapshot = { list: IntegrationDef[]; all: Map<string, IntegrationDef> };
let cache: { key: unknown; snap: Snapshot } | null = null;

/** Built-ins with the admin's status changes applied, plus published connectors. The snapshot is rebuilt only when the catalogue changes. */
function snapshot(): Snapshot {
  const st = typeof window === "undefined" ? null : catalogueSnapshotKey();
  if (cache && cache.key === st) return cache.snap;
  const merged: IntegrationDef[] = [];
  const all = new Map<string, IntegrationDef>();
  const push = (d: IntegrationDef) => {
    const o = overrideFor(d.id);
    const eff = o?.status ? { ...d, status: o.status } : d;
    all.set(d.id, eff);
    if (!o?.retired) merged.push(eff);
  };
  INTEGRATIONS.forEach(push);
  publishedConnectors().forEach(push);
  const snap = { list: merged, all };
  cache = { key: st, snap };
  return snap;
}

setIntegrationSource({ list: () => snapshot().list, byId: (id) => snapshot().all.get(id) });

/** Re-renders when a platform admin publishes or changes a connector. */
export function useIntegrations(): IntegrationDef[] {
  useCatalogueState();
  return useSyncExternalStore(() => () => {}, () => snapshot().list, () => INTEGRATIONS);
}
export { publishedById };
