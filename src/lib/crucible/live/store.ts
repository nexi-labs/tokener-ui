"use client";

import { useSyncExternalStore } from "react";
import { createLiveDriver, type LiveContext, type LiveDriver } from "./driver";
import type { DatasetEntry, Experiment, Me, ProjectRow, Store } from "./types";

/**
 * The state behind the Crucible screens in a signed-in workspace. It is only ever a copy of what the server returned: the sample workspace has its own store and the two
 * never mix. Runs, keys, machines, metrics and the audit trail are read by the screen that shows them, through the driver, because they are large and change while open.
 */
export type LiveState = { me: Me | null; projects: ProjectRow[]; experiments: Experiment[]; stores: Store[]; datasets: DatasetEntry[] };
export type LiveStatus = { connected: boolean; phase: "idle" | "loading" | "ready" | "error"; error?: string; partial?: string[]; loadedAt?: number };

const EMPTY = (): LiveState => ({ me: null, projects: [], experiments: [], stores: [], datasets: [] });
const IDLE: LiveStatus = { connected: false, phase: "idle" };
let state: LiveState = EMPTY(); let status: LiveStatus = IDLE; let driver: LiveDriver | null = null; let ctx: LiveContext = { orgId: null, isPlatform: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
function setStatus(next: LiveStatus) { status = next; emit(); }

export const useCrucibleLive = (): LiveState => useSyncExternalStore(subscribe, () => state, () => state);
export const useCrucibleStatus = (): LiveStatus => useSyncExternalStore(subscribe, () => status, () => IDLE);
export const isCrucibleLive = () => status.connected;
export function crucibleDriver(): LiveDriver { if (!driver) throw new Error("Crucible is not connected."); return driver; }

async function hydrate() {
  const d = driver; if (!d) return;
  setStatus({ connected: true, phase: "loading" });
  const { failed } = await d.refresh();
  if (d !== driver) return;
  if (failed.length === 0) setStatus({ connected: true, phase: "ready", loadedAt: Date.now() });
  else if (failed.some((f) => f.slice === "me") || failed.length >= 3) setStatus({ connected: true, phase: "error", error: failed[0].error });
  else setStatus({ connected: true, phase: "ready", partial: failed.map((f) => f.slice), loadedAt: Date.now() });
}

/** Switches the console to a signed-in workspace and loads it. Calling it again with the same organisation does nothing. */
export function connectCrucibleLive(next: LiveContext) {
  if (driver && ctx.orgId === next.orgId && ctx.userEmail === next.userEmail) return;
  disconnect(false);
  ctx = next; state = EMPTY();
  driver = createLiveDriver({ state: () => state, update: (fn) => { state = fn(state); emit(); }, context: () => ctx });
  if (!next.orgId) { setStatus({ connected: true, phase: "error", error: "Your account is not a member of an organisation yet." }); return; }
  void hydrate();
}
/** Back to the sample workspace. */
export function connectCrucibleDemo() { if (!driver && !status.connected) return; disconnect(true); }
function disconnect(notify: boolean) { driver = null; state = EMPTY(); ctx = { orgId: null, isPlatform: false }; status = IDLE; if (notify) emit(); }
export function reloadCrucible() { void hydrate(); }

/** What the server says this person may do. The names are the server's permissions: view, settings, connection_create, connection_rotate, connection_delete, machine_enroll,
 *  machine_revoke, expose_dataset, edit, run, run_cancel, approve, promote, register_model. */
export const useCrucibleCan = () => { const me = useCrucibleLive().me; return (p: string) => !!me?.permissions.includes(p); };
