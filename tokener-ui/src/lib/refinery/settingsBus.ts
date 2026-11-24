/**
 * The hand-off between the pure settings modules (semantics, agent access, data space, edge, data location) and the code that talks to the server. Those modules stay free of
 * browser and network imports so the logic checks can run on their own; they call pushSetting after saving to the browser, and settingsSync registers the function that sends it.
 */
export type SettingKind = "semantics" | "agent-access" | "data-space" | "edge" | "data-location";
export type SettingScope = "datasets" | "pools" | "org";
type Pusher = (scope: SettingScope, id: string, kind: SettingKind, value: unknown | null) => void;
let pusher: Pusher | null = null;
export function registerSettingPusher(p: Pusher | null) { pusher = p; }
/** Asks for the setting to be kept on the server. A value of null removes it. Does nothing until a pusher is registered, which only happens in the console. */
export function pushSetting(scope: SettingScope, id: string, kind: SettingKind, value: unknown | null) { pusher?.(scope, id, kind, value); }
