"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ApiError, http } from "@/lib/api/client";
import { defFromManifest, toManifest } from "@/lib/mlops/manifest";
import type { IntegrationDef, IntegrationStatus } from "@/lib/mlops/types";

/**
 * The connector catalogue as the control plane holds it. Platform operators publish a manifest, say where the implementation runs and decide when it is
 * available, all with no backend release. The sample workspace keeps its catalogue in the browser (connector-catalogue.ts); a signed-in operator uses this.
 */
export type Hosting = "BUILTIN" | "CONTRACT" | "REMOTE";
export type Release = { version: string; digest: string; publishedAt: string; publishedBy: string; note?: string };
export type Listing = {
  id: string; def: IntegrationDef; status: IntegrationStatus; hosting: Hosting; remoteUrl?: string; version: string; enabled: boolean; notes?: string;
  updatedAt: string; updatedBy: string; releases: Release[];
};
export type DryRunLine = { what: string; ok: boolean; detail: string };
export type PublishInput = { def: IntegrationDef; hosting: Hosting; remoteUrl?: string; remoteKeyId?: string; version: string; note?: string };

type J = Record<string, any>;
const BASE = "/api/v1/platform/mlops";
export const SEMVER = /^\d+\.\d+\.\d+$/;

export { toManifest };

export function toListing(x: J): Listing {
  const mf = (x.manifest ?? {}) as J;
  const releases: Release[] = Array.isArray(x.releases) ? x.releases.map((r: J) => ({ version: String(r.version), digest: String(r.manifestDigest ?? r.digest ?? ""), publishedAt: String(r.at ?? r.publishedAt ?? ""), publishedBy: String(r.by ?? r.publishedBy ?? ""), note: r.note ? String(r.note) : undefined })) : [];
  const h = String(x.hosting ?? "").toUpperCase();
  const hosting = (["BUILTIN", "CONTRACT", "REMOTE"].includes(h) ? h : "BUILTIN") as Hosting;
  const status = String(x.status ?? mf.status ?? "planned").toLowerCase() as IntegrationStatus;
  const def: IntegrationDef = defFromManifest({ ...mf, id: x.id ?? mf.id }, status);
  return {
    id: def.id, def, status, hosting, remoteUrl: x.remoteUrl ? String(x.remoteUrl) : undefined, version: String(x.version ?? "0.0.0"), enabled: x.enabled !== false,
    notes: x.notes ? String(x.notes) : undefined, updatedAt: String(x.updatedAt ?? ""), updatedBy: String(x.updatedBy ?? ""), releases,
  };
}

/** The next patch version after the one published, for a revision of an existing connector. */
export function nextVersion(current?: string): string {
  if (!current || !SEMVER.test(current)) return "1.0.0";
  const [a, b, c] = current.split(".").map(Number);
  return `${a}.${b}.${c + 1}`;
}

/** Whether `a` is newer than `b`, the rule the server applies on a revision (409 version_not_newer). */
export function isNewer(a: string, b: string): boolean {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

// ---------------------------------------------------------------------------------------------- calls

export const connectorApi = {
  list: async (): Promise<Listing[]> => (await http.get<J[]>(`${BASE}/connectors`)).map(toListing),
  publish: async (i: PublishInput): Promise<Listing> =>
    toListing(await http.post<J>(`${BASE}/connectors`, { manifest: toManifest(i.def), hosting: i.hosting, remoteUrl: i.remoteUrl, remoteKeyId: i.remoteKeyId, version: i.version, note: i.note })),
  setStatus: async (id: string, status: IntegrationStatus, enabled: boolean, note?: string): Promise<Listing> =>
    toListing(await http.post<J>(`${BASE}/connectors/${encodeURIComponent(id)}:status`, { status, enabled, note })),
  dryRun: async (def: IntegrationDef): Promise<DryRunLine[]> => {
    const out = await http.post<J[]>(`${BASE}/connectors:dryRun`, toManifest(def));
    return out.map((l) => ({ what: String(l.what), ok: l.ok === true, detail: String(l.detail ?? "") }));
  },
  seed: async (): Promise<number> => Number((await http.post<J>(`${BASE}/connectors:seed`, {})).seeded ?? 0),
};

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong. Try again.");

// ---------------------------------------------------------------------------------------------- state

type State = { listings: Listing[] | null; error?: string; loading: boolean };
let state: State = { listings: null, loading: false };
const listeners = new Set<() => void>();
const set = (n: State) => { state = n; listeners.forEach((l) => l()); };

export async function reloadListings(): Promise<void> {
  set({ ...state, loading: true });
  try { set({ listings: await connectorApi.list(), loading: false }); } catch (e) { set({ listings: state.listings, loading: false, error: errorText(e) }); }
}
export function putListing(l: Listing) { set({ ...state, error: undefined, listings: [...(state.listings ?? []).filter((x) => x.id !== l.id), l].sort((a, b) => a.id.localeCompare(b.id)) }); }

/** The server's catalogue. Loads once when a signed-in platform operator first asks for it. */
export function useServerCatalogue(active: boolean): State {
  const s = useSyncExternalStore((l) => { listeners.add(l); return () => void listeners.delete(l); }, () => state, () => state);
  useEffect(() => { if (active && s.listings === null && !s.loading && !s.error) void reloadListings(); }, [active, s.listings, s.loading, s.error]);
  return s;
}
