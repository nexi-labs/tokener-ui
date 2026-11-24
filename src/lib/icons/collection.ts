import {
  Activity, BarChart3, Banknote, Bell, Blocks, Bot, Boxes, Brain, Braces, Building2, Cable, CalendarDays, Cloud, Code2, Cog, Container, Cpu, CreditCard, Database, Factory,
  FileText, Folder, Gauge, GitBranch, Globe, HardDrive, Inbox, KeyRound, Layers, LineChart, Lock, Mail, MessageSquare, Network, Package, Phone, Plug, Radio, Rocket, Search,
  Send, Server, ShieldCheck, Smartphone, Sparkles, Table2, TerminalSquare, Users, Wallet, Webhook, Workflow, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import { BRAND_ICONS, type BrandIcon } from "./brand-icons.generated";

/**
 * The icon collection platform admins choose from when they publish a connector. Brand icons are real marks from simple-icons
 * (simpleicons.org), imported by name so the bundle holds only these. Generic glyphs cover systems that have no brand mark. A
 * private system can upload its own SVG, which is reduced to one validated path (see {@link sanitizeSvg}) and never rendered as markup.
 */

export type GlyphIcon = { id: string; title: string; group: "Generic glyphs"; icon: LucideIcon; keywords: string[] };

const g = (id: string, title: string, icon: LucideIcon, ...keywords: string[]): GlyphIcon => ({ id: "glyph-" + id, title, group: "Generic glyphs", icon, keywords });

export const GLYPHS: GlyphIcon[] = [
  g("server", "Server", Server, "host", "machine", "vm"), g("cluster", "Cluster", Boxes, "kubernetes", "nodes", "fleet"), g("cloud", "Cloud", Cloud, "hosting", "saas"),
  g("database", "Database", Database, "sql", "store", "table"), g("cpu", "Compute", Cpu, "gpu", "processor", "chip"), g("globe", "Web", Globe, "http", "site", "internet"),
  g("package", "Package", Package, "artifact", "bundle", "registry"), g("workflow", "Workflow", Workflow, "pipeline", "orchestration", "flow"), g("mail", "Email", Mail, "smtp", "message"),
  g("inbox", "Inbox", Inbox, "imap", "mailbox"), g("calendar", "Calendar", CalendarDays, "schedule", "events"), g("phone", "Phone", Smartphone, "mobile", "sms", "momo"),
  g("telephone", "Telephone", Phone, "voice", "call"), g("card", "Card payments", CreditCard, "payment", "checkout"), g("money", "Money", Banknote, "cash", "billing", "invoice"),
  g("wallet", "Wallet", Wallet, "crypto", "balance"), g("blocks", "Blocks", Blocks, "mcp", "plugin", "modules"), g("terminal", "Terminal", TerminalSquare, "shell", "stdio", "cli"),
  g("chat", "Chat", MessageSquare, "slack", "teams", "notify"), g("disk", "Storage", HardDrive, "object", "bucket", "s3", "files"), g("network", "Network", Network, "mesh", "vpc", "dns"),
  g("cable", "Cable", Cable, "connector", "link"), g("plug", "Plug", Plug, "integration", "connect"), g("webhook", "Webhook", Webhook, "callback", "events"),
  g("key", "Key", KeyRound, "secret", "credential", "token"), g("shield", "Shield", ShieldCheck, "security", "policy", "compliance"), g("lock", "Lock", Lock, "vault", "encryption"),
  g("container", "Container", Container, "docker", "image", "oci"), g("branch", "Git branch", GitBranch, "source", "repository", "git"), g("layers", "Layers", Layers, "stack", "tiers"),
  g("gauge", "Gauge", Gauge, "metrics", "latency", "slo"), g("chart", "Line chart", LineChart, "observability", "monitoring", "trend"), g("bars", "Bar chart", BarChart3, "analytics", "report"),
  g("activity", "Activity", Activity, "health", "heartbeat", "trace"), g("bell", "Alerts", Bell, "pager", "notification"), g("file", "Document", FileText, "docs", "pdf", "text"),
  g("folder", "Folder", Folder, "directory", "path"), g("search", "Search", Search, "index", "retrieval", "query"), g("bot", "Agent", Bot, "assistant", "automation"),
  g("brain", "Model", Brain, "ml", "inference", "ai"), g("sparkles", "Generative AI", Sparkles, "llm", "prompt"), g("zap", "Fast path", Zap, "stream", "realtime", "serverless"),
  g("radio", "Broadcast", Radio, "pubsub", "topic", "kafka"), g("cog", "Settings", Cog, "config", "admin"), g("wrench", "Tooling", Wrench, "ops", "maintenance"),
  g("code", "Code", Code2, "sdk", "script"), g("braces", "API", Braces, "json", "rest", "schema"), g("table", "Table", Table2, "dataset", "csv", "warehouse"),
  g("rocket", "Release", Rocket, "deploy", "launch"), g("send", "Send", Send, "outbound", "delivery"), g("users", "People", Users, "team", "directory", "iam"),
  g("building", "Organisation", Building2, "company", "tenant", "enterprise"), g("factory", "Industry", Factory, "manufacturing", "plant", "iot"), g("zap-bolt", "Energy", Zap, "power", "grid"),
];

export const BRANDS: BrandIcon[] = BRAND_ICONS;

export type IconId = string;
export type SvgIcon = { viewBox: string; d: string; hex?: string; title?: string };

/** What a connector stores: a collection id, or an uploaded private icon. Nothing else, so a manifest can never carry markup. */
export type StoredIcon = { ref: IconId } | { svg: SvgIcon };

export const GROUPS: string[] = [...new Set(BRANDS.map((b) => b.group)), "Generic glyphs"];

const BRAND_BY_ID = new Map(BRANDS.map((b) => [b.id, b]));
const GLYPH_BY_ID = new Map(GLYPHS.map((x) => [x.id, x]));

export type Resolved =
  | { kind: "brand"; id: string; title: string; path: string; hex: string }
  | { kind: "glyph"; id: string; title: string; icon: LucideIcon };

export function resolveIcon(id: IconId | undefined | null): Resolved | undefined {
  if (!id) return undefined;
  const b = BRAND_BY_ID.get(id);
  if (b) return { kind: "brand", id: b.id, title: b.title, path: b.path, hex: b.hex };
  const x = GLYPH_BY_ID.get(id);
  return x ? { kind: "glyph", id: x.id, title: x.title, icon: x.icon } : undefined;
}

/** Case-insensitive search over name, group and keywords. An empty query returns everything in the group. */
export function searchIcons(query: string, group: string | "all" = "all"): { brands: BrandIcon[]; glyphs: GlyphIcon[] } {
  const q = query.trim().toLowerCase();
  const hit = (...parts: string[]) => !q || parts.join(" ").toLowerCase().includes(q);
  return {
    brands: BRANDS.filter((b) => (group === "all" || b.group === group) && hit(b.title, b.group, b.id.replace("si-", ""))),
    glyphs: GLYPHS.filter((x) => (group === "all" || group === "Generic glyphs") && hit(x.title, x.group, ...x.keywords)),
  };
}

// ------------------------------------------------------------------------------------------------ uploads

export const SVG_LIMITS = { maxBytes: 20 * 1024, maxPathChars: 20000, maxDim: 1024 };
/** Characters an SVG path may contain. Anything else is refused, so the value can only ever draw. */
export const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+\-]+$/;
const VIEWBOX = /^\s*(-?\d+(\.\d+)?)[\s,]+(-?\d+(\.\d+)?)[\s,]+(\d+(\.\d+)?)[\s,]+(\d+(\.\d+)?)\s*$/;
const HEX = /^[0-9a-fA-F]{6}$/;

const n = (v: number) => String(Math.round(v * 1000) / 1000);

function shapeToPath(el: Element): string | null {
  const num = (a: string) => Number(el.getAttribute(a) ?? "0");
  switch (el.tagName.toLowerCase()) {
    case "path": return el.getAttribute("d");
    case "circle": { const cx = num("cx"), cy = num("cy"), r = num("r"); return r > 0 ? `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z` : null; }
    case "ellipse": { const cx = num("cx"), cy = num("cy"), rx = num("rx"), ry = num("ry"); return rx > 0 && ry > 0 ? `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(2 * rx)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-2 * rx)} 0Z` : null; }
    case "rect": { const x = num("x"), y = num("y"), w = num("width"), h = num("height"); return w > 0 && h > 0 ? `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z` : null; }
    case "polygon": case "polyline": {
      const pts = (el.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number);
      if (pts.length < 4 || pts.length % 2 || pts.some((x) => !Number.isFinite(x))) return null;
      let d = `M${n(pts[0])} ${n(pts[1])}`;
      for (let i = 2; i < pts.length; i += 2) d += `L${n(pts[i])} ${n(pts[i + 1])}`;
      return el.tagName.toLowerCase() === "polygon" ? d + "Z" : d;
    }
    case "line": return `M${n(num("x1"))} ${n(num("y1"))}L${n(num("x2"))} ${n(num("y2"))}`;
    default: return null;
  }
}

const ALLOWED = new Set(["svg", "g", "path", "circle", "ellipse", "rect", "polygon", "polyline", "line", "title", "desc"]);

export type SanitizeResult = { ok: true; icon: SvgIcon } | { ok: false; error: string };

/**
 * Turns an uploaded SVG into one validated path. Scripts, styles, images, links, filters, gradients, transforms and event handlers are
 * refused rather than stripped, so an upload can never change what the page does. Colour is chosen by the admin, not taken from the file.
 */
export function sanitizeSvg(text: string, hex?: string): SanitizeResult {
  if (new Blob([text]).size > SVG_LIMITS.maxBytes) return { ok: false, error: `The file is larger than ${SVG_LIMITS.maxBytes / 1024} KB.` };
  if (typeof DOMParser === "undefined") return { ok: false, error: "SVG upload needs a browser." };
  if (/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(text)) return { ok: false, error: "The file declares entities or a stylesheet, which is not accepted." };
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) return { ok: false, error: "The file is not a valid SVG." };
  const vb = VIEWBOX.exec(root.getAttribute("viewBox") ?? "");
  if (!vb) return { ok: false, error: "The SVG needs a viewBox such as 0 0 24 24." };
  const w = Number(vb[5]), h = Number(vb[7]);
  if (!(w > 0 && h > 0) || w > SVG_LIMITS.maxDim || h > SVG_LIMITS.maxDim) return { ok: false, error: `The viewBox must be larger than 0 and at most ${SVG_LIMITS.maxDim} wide and high.` };
  const paths: string[] = [];
  let title: string | undefined;
  for (const el of Array.from(root.querySelectorAll("*")).concat(root)) {
    const tag = el.tagName.toLowerCase();
    if (!ALLOWED.has(tag)) return { ok: false, error: `The element <${tag}> is not accepted. Use plain shapes and paths, with no scripts, styles, images, gradients or filters.` };
    for (const a of Array.from(el.attributes)) {
      const name = a.name.toLowerCase();
      if (name.startsWith("on") || name.includes("href")) return { ok: false, error: "Event handlers and links are not accepted in an icon." };
      if (name === "transform") return { ok: false, error: "Transforms are not accepted. Export the icon with transforms applied (flatten it) and upload again." };
      if (/url\(|javascript:|data:/i.test(a.value)) return { ok: false, error: "References to other content are not accepted in an icon." };
    }
    if (tag === "title" && !title) title = (el.textContent ?? "").trim().slice(0, 60) || undefined;
    if (tag === "svg" || tag === "g" || tag === "title" || tag === "desc") continue;
    const d = shapeToPath(el);
    if (!d) return { ok: false, error: `A <${tag}> in the file has no drawable geometry.` };
    paths.push(d.trim());
  }
  const d = paths.join("");
  if (!d) return { ok: false, error: "The SVG has no shapes." };
  if (d.length > SVG_LIMITS.maxPathChars) return { ok: false, error: `The icon is too detailed (${d.length} characters of path data, at most ${SVG_LIMITS.maxPathChars}). Simplify it and try again.` };
  if (!PATH_DATA.test(d)) return { ok: false, error: "The path data contains characters that are not allowed." };
  if (hex && !HEX.test(hex)) return { ok: false, error: "The colour must be six hexadecimal digits." };
  return { ok: true, icon: { viewBox: `${n(Number(vb[1]))} ${n(Number(vb[3]))} ${n(w)} ${n(h)}`, d, hex: hex?.toUpperCase(), title } };
}

/** The same checks for a stored icon, applied again to anything read back, so a tampered manifest cannot inject markup. */
export function isSafeIcon(i: unknown): i is StoredIcon {
  if (!i || typeof i !== "object") return false;
  const o = i as Record<string, unknown>;
  if (typeof o.ref === "string") return /^(si|glyph)-[a-z0-9-]+$/.test(o.ref);
  const s = o.svg as Record<string, unknown> | undefined;
  return !!s && typeof s.viewBox === "string" && VIEWBOX.test(s.viewBox) && typeof s.d === "string" && s.d.length <= SVG_LIMITS.maxPathChars && PATH_DATA.test(s.d) && (s.hex === undefined || (typeof s.hex === "string" && HEX.test(s.hex)));
}
