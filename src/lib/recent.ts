import type { LucideIcon } from "lucide-react";
import { NAV_GROUPS, TOP_NAV, itemActive, type NavItem } from "./nav";

/**
 * The pages a person opened in this sign-in, newest first. Kept in session storage, so a new sign-in starts empty and nothing outlives the tab.
 * Only the address is stored; the name and icon are worked out from the navigation when the list is drawn, so a renamed page never shows an old name.
 */
export const RECENT_KEY = "tok.recent"; export const RECENT_OPEN_KEY = "tok.recent.open"; export const RECENT_MAX = 10;

export type RecentEntry = { href: string; at: number };
export type RecentView = { href: string; label: string; group: string; detail?: string; icon: LucideIcon };

export function readRecent(): RecentEntry[] {
  try { const v = JSON.parse(sessionStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(v) ? v.filter((e) => e && typeof e.href === "string").slice(0, RECENT_MAX + 1) : []; } catch { return []; }
}
export function clearRecent() { try { sessionStorage.removeItem(RECENT_KEY); } catch { /* storage unavailable */ } }

/** Puts a page at the front, once. A page opened again moves up instead of appearing twice. Pages that are not part of the console are not kept. */
export function pushRecent(list: RecentEntry[], path: string, at = Date.now()): RecentEntry[] {
  const clean = path.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  if (!match(clean)) return list;
  return [{ href: clean, at }, ...list.filter((e) => e.href !== clean)].slice(0, RECENT_MAX + 1);
}

const all = (): { item: NavItem; group: string }[] => [...TOP_NAV.map((item) => ({ item, group: "Home" })), ...NAV_GROUPS.flatMap((g) => g.items.map((item) => ({ item, group: g.label })))];

/** The navigation entry a path belongs to: the one with the longest address that is active for it. */
function match(path: string) {
  let best: { item: NavItem; group: string } | undefined;
  for (const x of all()) if (itemActive(path, x.item) && (!best || x.item.href.length > best.item.href.length)) best = x;
  return best;
}

/** What to show for a path. A page deeper than its menu entry (an agent's page under Agents) shows the last part of the address as detail. */
export function describeRecent(path: string, nameFor?: (path: string) => string | undefined): RecentView | undefined {
  const m = match(path); if (!m) return undefined;
  const rest = path.slice(m.item.href.length).split("/").filter(Boolean);
  const named = rest.length ? nameFor?.(path) : undefined;
  const detail = named ?? (rest.length ? decodeURIComponent(rest[rest.length - 1]).slice(0, 28) : undefined);
  return { href: path, label: m.item.label, group: m.group, detail, icon: m.item.icon };
}

/** The list to show: earlier pages only, so the page you are on is not offered back to you, and a fresh sign-in shows nothing. */
export function visibleRecent(list: RecentEntry[], current: string, nameFor?: (path: string) => string | undefined): RecentView[] {
  const cur = current.split("?")[0].replace(/\/+$/, "") || "/";
  return list.filter((e) => e.href !== cur).map((e) => describeRecent(e.href, nameFor)).filter((v): v is RecentView => !!v).slice(0, RECENT_MAX);
}
