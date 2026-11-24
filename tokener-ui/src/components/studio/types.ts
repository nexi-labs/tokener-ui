import type { LucideIcon } from "lucide-react";

export type Mode = "policy" | "pipeline" | "trace";

export type ParamType = "text" | "number" | "select" | "toggle" | "list" | "time" | "datetime" | "textarea";

export type ParamDef = {
  key: string;
  label: string;
  type: ParamType;
  options?: string[];
  default?: string | number | boolean;
  help?: string;
  placeholder?: string;
  /** Text and select params are required unless this is set. */
  optional?: boolean;
};

/** Either a lucide glyph, a real brand icon object from the `simple-icons` package, or a
 * simpleicons.org CDN slug for brands the installed package does not ship. */
export type IconRef =
  | { lucide: LucideIcon }
  | { si: { title: string; path: string; hex: string } }
  | { cdn: string; hex?: string; fallback: LucideIcon }
  /** An icon from the platform icon collection (lib/icons/collection.ts). What a published connector stores. */
  | { ref: string }
  /** A glyph from the tok∑ner Functions icon set (lib/functions/icon-set.ts). */
  | { fn: import("@/lib/functions/icon-set").FnIconName }
  /** A private icon uploaded by a platform admin, reduced to one validated path. */
  | { svg: { viewBox: string; d: string; hex?: string; title?: string } };

export type Tone = "neutral" | "accent" | "warn" | "danger" | "info" | "violet";

export type NodeDef = {
  kind: string;
  label: string;
  group: string;
  modes: Mode[];
  icon: IconRef;
  tone: Tone;
  desc: string;
  about: string;
  params: ParamDef[];
  /** Does the node accept incoming / emit outgoing edges? */
  hasIn: boolean;
  hasOut: boolean;
  singleton?: boolean;
  /** Part of the roadmap, not yet enforced by the backend. Shown with a "planned" badge. */
  planned?: boolean;
  /** One-line summary shown under the title on the canvas. */
  summary?: (p: Record<string, any>) => string;
};

export type NodeStatus = "ok" | "warn" | "error" | "skip" | "active";

export type TraceMeta = {
  startMs: number;
  ms: number;
  status: NodeStatus;
  attrs: Record<string, string>;
  note?: string;
};

export type GNode = {
  id: string;
  kind: string;
  x: number;
  y: number;
  params: Record<string, any>;
  /** Trace spans and live simulation state. */
  meta?: TraceMeta;
  sim?: NodeStatus;
};

export type EdgeType = "flow" | "allow" | "deny" | "limit" | "async" | "failover";

export type GEdge = {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  label?: string;
};

export type Graph = { nodes: GNode[]; edges: GEdge[] };

export type Issue = { level: "error" | "warn" | "info"; msg: string; nodeId?: string };

export type CodeTab = { id: string; label: string; lang: string; text: string };

export const NODE_W = 208;
export const NODE_H = 68;

export const EDGE_STYLE: Record<EdgeType, { color: string; dash?: string; label: string }> = {
  flow: { color: "#6B7F84", label: "Request flow" },
  allow: { color: "#00B876", label: "Allow / pass" },
  deny: { color: "#DC3B3B", dash: "7 5", label: "Deny / reject" },
  limit: { color: "#D98A15", dash: "3 4", label: "Limit / throttle" },
  async: { color: "#2F6FE0", dash: "2 5", label: "Async event" },
  failover: { color: "#8B5CF6", dash: "9 4 2 4", label: "Failover" },
};

export const TONE: Record<Tone, { bar: string; tile: string; text: string }> = {
  neutral: { bar: "#6B7F84", tile: "bg-surface-muted", text: "text-text-secondary" },
  accent: { bar: "#00B876", tile: "bg-accent-50", text: "text-accent-700" },
  warn: { bar: "#D98A15", tile: "bg-[#FBF1DE]", text: "text-[#9A5F05]" },
  danger: { bar: "#DC3B3B", tile: "bg-[#FCE9E9]", text: "text-[#B02A2A]" },
  info: { bar: "#2F6FE0", tile: "bg-[#E6EEFC]", text: "text-[#2557B8]" },
  violet: { bar: "#8B5CF6", tile: "bg-[#EFE9FD]", text: "text-[#6B3FD4]" },
};
