"use client";

import { useSyncExternalStore } from "react";
import type { IntegrationDef, IntegrationStatus } from "@/lib/mlops/types";

/**
 * The platform connector catalogue as platform admins shape it: connectors published from the console, drafts in progress, and status
 * changes to built-in entries. Only the platform's own operators can write here, and the server enforces that again (docs/21).
 * Customer organizations read it: a published connector appears in every organization's integration list at once, with no backend release.
 */

const KEY = "tokener.platform.connectors.v1";

export type Draft = { id: string; savedAt: string; step: number; def: IntegrationDef };
export type Override = { status?: IntegrationStatus; retired?: boolean; note?: string; at: string; by: string };
export type HistoryEntry = { at: string; by: string; connector: string; what: string };

type State = { v: 1; published: Record<string, IntegrationDef>; drafts: Record<string, Draft>; overrides: Record<string, Override>; history: HistoryEntry[] };

const EMPTY: State = { v: 1, published: {}, drafts: {}, overrides: {}, history: [] };
let state: State | null = null;
const listeners = new Set<() => void>();

function load(): State {
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw) as State; if (s.v === 1) return s; } } catch { /* start empty */ }
  return { ...EMPTY, published: {}, drafts: {}, overrides: {}, history: [] };
}
const get = (): State => (state ??= load());
function set(fn: (s: State) => State) {
  state = fn(get());
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* memory only when storage is unavailable */ }
  listeners.forEach((l) => l());
}

export function useCatalogueState(): State | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => void listeners.delete(l); }, () => get(), () => null);
}

export const publishedConnectors = (): IntegrationDef[] => (typeof window === "undefined" ? [] : Object.values(get().published));
export const publishedById = (id: string): IntegrationDef | undefined => (typeof window === "undefined" ? undefined : get().published[id]);
export const overrideFor = (id: string): Override | undefined => (typeof window === "undefined" ? undefined : get().overrides[id]);

const stamp = () => new Date().toISOString();

export function savePublished(def: IntegrationDef, by: string, what: string) {
  set((s) => ({ ...s, published: { ...s.published, [def.id]: def }, drafts: Object.fromEntries(Object.entries(s.drafts).filter(([k]) => k !== def.id)), history: [{ at: stamp(), by, connector: def.id, what }, ...s.history].slice(0, 200) }));
}
export function saveDraft(d: Draft) { set((s) => ({ ...s, drafts: { ...s.drafts, [d.id]: d } })); }
export function discardDraft(id: string) { set((s) => ({ ...s, drafts: Object.fromEntries(Object.entries(s.drafts).filter(([k]) => k !== id)) })); }

export function setOverride(id: string, patch: Partial<Omit<Override, "at" | "by">>, by: string, what: string) {
  set((s) => ({ ...s, overrides: { ...s.overrides, [id]: { ...s.overrides[id], ...patch, at: stamp(), by } }, history: [{ at: stamp(), by, connector: id, what }, ...s.history].slice(0, 200) }));
}
export function removePublished(id: string, by: string) {
  set((s) => ({ ...s, published: Object.fromEntries(Object.entries(s.published).filter(([k]) => k !== id)), history: [{ at: stamp(), by, connector: id, what: "Removed from the catalogue" }, ...s.history].slice(0, 200) }));
}

/** The identity of the current state object. It changes on every write, so derived data can be cached against it. */
export const catalogueSnapshotKey = (): unknown => get();
