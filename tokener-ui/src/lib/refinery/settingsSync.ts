/**
 * Keeps the settings that screens edit as you type (what a column means, what agents may see, data space terms, an edge profile, the data location policy) in step with the
 * server. In a signed-in workspace every change is sent to the settings API after a short pause, with the version the browser last read so that a change made by someone else is
 * never overwritten without notice, and what the server holds is loaded when a screen opens. In the sample workspace there is no context and nothing is sent: the settings stay
 * in this browser, as before. The browser copy is also kept in live mode, so the screens that read it synchronously keep working.
 */
import { useEffect, useSyncExternalStore } from "react";
import { ApiError, http } from "@/lib/api/client";
import { registerSettingPusher, type SettingKind, type SettingScope } from "./settingsBus";

export type { SettingKind, SettingScope };
type Server = { kind: string; scopeId: string; value: Record<string, unknown>; version: number };

let orgId: string | null = null;
/** Called by the store when a signed-in workspace connects (an organisation id) or disconnects (null). */
export function setSyncOrganisation(id: string | null) { if (id === orgId) return; orgId = id; versions.clear(); for (const t of timers.values()) clearTimeout(t); timers.clear(); pending.clear(); setStatus({ phase: "idle" }); }
export const syncsToServer = () => orgId !== null;

const path = (scope: SettingScope, id: string, kind: SettingKind) => `/api/v1/orgs/${encodeURIComponent(orgId ?? "")}/refinery/${scope === "org" ? "" : `${scope}/${encodeURIComponent(id)}/`}settings/${kind}`;
const idOf = (scope: SettingScope, kind: SettingKind, id: string) => `${scope}:${kind}:${scope === "org" ? "org" : id}`;

export type SyncStatus = { phase: "idle" | "saving" | "saved" | "error"; message?: string };
let status: SyncStatus = { phase: "idle" };
const listeners = new Set<() => void>();
function setStatus(s: SyncStatus) { status = s; listeners.forEach((l) => l()); }
/** The current status, for code outside React. */
export const syncStatus = (): SyncStatus => status;
export function useSyncStatus(): SyncStatus { return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => status, () => status); }

const versions = new Map<string, number>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, { scope: SettingScope; id: string; kind: SettingKind; value: unknown | null }>();
const DELAY_MS = 700;

async function flush(k: string) {
  const job = pending.get(k); if (!job || orgId === null) return;
  pending.delete(k);
  setStatus({ phase: "saving" });
  try {
    if (job.value === null) { await http.delete(path(job.scope, job.id, job.kind)); versions.delete(k); }
    else {
      const known = versions.get(k);
      const saved = await http.put<Server>(path(job.scope, job.id, job.kind), known === undefined ? { value: job.value } : { value: job.value, expectedVersion: known });
      versions.set(k, saved.version);
    }
    if (pending.size === 0) setStatus({ phase: "saved" });
  } catch (e) {
    if (e instanceof ApiError && e.code === "stale_setting") { versions.delete(k); setStatus({ phase: "error", message: "Someone else changed this setting. Reload the page to see their version, then repeat your change." }); }
    else setStatus({ phase: "error", message: e instanceof Error ? e.message : "Could not save to the server." });
  }
}

/** Sends the setting to the server after a short pause. Does nothing in the sample workspace. A value of null removes it. */
function push(scope: SettingScope, id: string, kind: SettingKind, value: unknown | null) {
  if (orgId === null) return;
  const k = idOf(scope, kind, id);
  pending.set(k, { scope, id, kind, value });
  const t = timers.get(k); if (t) clearTimeout(t);
  timers.set(k, setTimeout(() => { timers.delete(k); void flush(k); }, DELAY_MS));
}

registerSettingPusher(push);

/** Reads the setting from the server and puts it in the browser copy under cacheKey. True when the browser copy now reflects the server (a value was stored, or a leftover copy was cleared). */
export async function pullSetting(scope: SettingScope, id: string, kind: SettingKind, cacheKey: string): Promise<boolean> {
  if (orgId === null) return false;
  const k = idOf(scope, kind, id);
  try {
    const s = await http.get<Server>(path(scope, id, kind));
    versions.set(k, s.version);
    if (pending.has(k)) return false;
    if (s.version === 0) { if (localStorage.getItem(cacheKey) === null) return false; localStorage.removeItem(cacheKey); return true; }
    // True whenever the server's copy is now what the browser holds, even if it already was: React may have run the screen's first load twice, and the load that is still listening must apply it.
    localStorage.setItem(cacheKey, JSON.stringify(s.value)); return true;
  } catch (e) {
    if (!(e instanceof ApiError && (e.status === 404 || e.status === 403))) setStatus({ phase: "error", message: e instanceof Error ? e.message : "Could not read the saved setting." });
    return false;
  }
}

/** Loads the server copy when a screen opens or the scope changes, and calls reload once the browser copy reflects the server. */
export function useServerSetting(scope: SettingScope, id: string, kind: SettingKind, cacheKey: string, reload: () => void) {
  useEffect(() => {
    if (!syncsToServer() || (scope !== "org" && !id)) return;
    let live = true;
    void pullSetting(scope, id, kind, cacheKey).then((changed) => { if (live && changed) reload(); });
    return () => { live = false; };
  }, [scope, id, kind, cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
