/**
 * Agent Networks: how an agent is reached and what it may reach. Three layers, in the order a call meets them.
 *
 *   Reach     private (only the members of a named Agent Network), internal (anyone in the organisation who signs in) or public (the internet, through the tok∑ner edge).
 *   Ingress   who may call the agent and what the call may contain: identity, address and country rules, limits, and a shield that reads the prompt.
 *   Egress    where the agent may call: a default of deny with a list of what is allowed, blocks on private ranges, a fixed address, and a check on what leaves.
 *
 * Everything here is pure. The same functions draw the screens, score the setup, and answer "would this call get through" for the tester, so what a person
 * tries on the Network tab is the rule the control plane applies. In the sample workspace nothing is enforced; the design is what the real edge has to honour.
 */
import type { Agent } from "./types";

export type Reach = "private" | "internal" | "public";
export type IngressAuth = "api-key" | "jwt" | "mtls";
export type Guard = "off" | "log" | "block";
export type PiiGuard = "off" | "log" | "mask" | "block";
export type EgressMode = "allow-all" | "allowlist" | "deny-all";
export type RuleKind = "host" | "cidr" | "mcp" | "model" | "agent";

export type EgressRule = { id: string; kind: RuleKind; value: string; ports?: number[]; note: string };
export type NetworkConfig = {
  reach: Reach;
  /** The named Agent Network this agent belongs to. Required for a private agent. */
  network?: string;
  ingress: {
    /** The ways a caller may prove who it is. Empty accepts anyone, which only an agent with nothing to lose should do. */
    auth: IngressAuth[];
    allowCidrs: string[]; blockCidrs: string[];
    geo: { mode: "off" | "allow" | "block"; countries: string[] };
    rate: { perMin: number; perIpPerMin: number };
    maxPayloadKb: number;
    shield: { injection: Guard; pii: PiiGuard; bots: boolean };
    tls: { min: "1.2" | "1.3"; hostname: string };
    /** For an agent that runs elsewhere: the origin accepts calls only from the tok∑ner edge, so nobody can go around the protections. */
    originLock: boolean;
  };
  egress: { mode: EgressMode; rules: EgressRule[]; blockPrivateRanges: boolean; dnsFilter: boolean; viaGateway: boolean; dlp: Guard };
  logging: { logBlocked: boolean; logAllowed: boolean; retainDays: number };
  updatedAt: string; updatedBy: string;
};

export type AgentNetwork = {
  id: string; name: string; description: string;
  /** Private: closed to everything outside it unless peered. Shared: a meeting place between teams, with the same identity rules. */
  kind: "private" | "shared";
  /** How members prove who they are to each other. */
  identity: "mtls" | "jwt";
  /** Other networks whose members may call into this one, and be called by it. */
  peers: string[];
  owner: string; createdAt: string;
};

export const REACH: { id: Reach; label: string; blurb: string; who: string }[] = [
  { id: "private", label: "Private", blurb: "Only members of a named Agent Network can call it. It has no public address and no route from the internet.", who: "Agents that handle money, health or legal data and are called by a few known agents." },
  { id: "internal", label: "Internal", blurb: "Anyone in your organisation who signs in, and your other agents, through the gateway. Nothing from outside.", who: "Agents used by your own apps and teams." },
  { id: "public", label: "Public", blurb: "Reachable from the internet at an address of its own, behind the tok∑ner edge: identity, limits and the shield apply before a call reaches it.", who: "Agents that customers, partners or the public talk to." },
];
export const AUTH_LABEL: Record<IngressAuth, string> = { "api-key": "API key", jwt: "Signed token (OIDC)", mtls: "Client certificate (mTLS)" };
export const GUARD_LABEL: Record<Guard, string> = { off: "Off", log: "Log only", block: "Block" };
export const PII_LABEL: Record<PiiGuard, string> = { off: "Off", log: "Log only", mask: "Mask", block: "Block" };
export const EGRESS_LABEL: Record<EgressMode, string> = { "allow-all": "Allow everything", allowlist: "Only what is listed", "deny-all": "Nothing" };
export const RULE_KIND: Record<RuleKind, { label: string; hint: string; example: string }> = {
  host: { label: "Website or API", hint: "A host name. Start with *. to cover every subdomain.", example: "api.stripe.com" },
  cidr: { label: "Address range", hint: "An IPv4 range in CIDR form.", example: "203.0.113.0/24" },
  mcp: { label: "MCP server", hint: "An MCP server registered in MCP Servers, by name.", example: "crm" },
  model: { label: "Model", hint: "A model reached through the tok∑ner gateway, by name.", example: "gpt-5" },
  agent: { label: "Another agent", hint: "An agent in the registry, by its name.", example: "refund-approver" },
};
export const COUNTRIES: [string, string][] = [["US", "United States"], ["GB", "United Kingdom"], ["DE", "Germany"], ["FR", "France"], ["NL", "Netherlands"], ["IE", "Ireland"], ["ES", "Spain"], ["IT", "Italy"], ["SE", "Sweden"], ["CH", "Switzerland"], ["CA", "Canada"], ["AU", "Australia"], ["JP", "Japan"], ["SG", "Singapore"], ["IN", "India"], ["BR", "Brazil"], ["AE", "United Arab Emirates"], ["SA", "Saudi Arabia"], ["BH", "Bahrain"], ["ZA", "South Africa"], ["NG", "Nigeria"], ["KR", "South Korea"], ["CN", "China"], ["RU", "Russia"], ["KP", "North Korea"], ["IR", "Iran"]];
export const COUNTRY_NAME = Object.fromEntries(COUNTRIES) as Record<string, string>;

let n = 0; const rid = (p: string) => `${p}_${(++n).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
export const newRule = (kind: RuleKind, value: string, note = ""): EgressRule => ({ id: rid("egr"), kind, value, note });

// ---------------------------------------------------------------------------------------------------------------------------------------
// Presets

export type PresetId = "private" | "internal" | "public" | "open";
export const PRESETS: { id: PresetId; label: string; blurb: string; tone: "good" | "info" | "warn" }[] = [
  { id: "private", label: "Private network", blurb: "Closed to everything outside a named network. Certificates between members. Nothing leaves except what you list.", tone: "good" },
  { id: "internal", label: "Internal", blurb: "Your organisation only, signed in. Outbound limited to what the agent already uses.", tone: "good" },
  { id: "public", label: "Public, hardened", blurb: "Open to the internet behind identity, limits and the shield. Outbound limited to what the agent already uses.", tone: "good" },
  { id: "open", label: "Open (not recommended)", blurb: "No identity and no limits. Only for an agent that reads public facts and can do nothing.", tone: "warn" },
];

/** What the agent already uses, as egress rules: its MCP servers, its models and, for a registered agent, nothing it has not told us about. */
export function suggestEgress(a: Pick<Agent, "tools" | "models" | "control">): EgressRule[] {
  const out: EgressRule[] = []; const seen = new Set<string>();
  for (const t of a.tools) if (!seen.has("mcp:" + t.server)) { seen.add("mcp:" + t.server); out.push(newRule("mcp", t.server, "A tool server the agent already calls")); }
  for (const m of a.models) if (m && !/vendor managed|unknown/i.test(m) && !seen.has("model:" + m)) { seen.add("model:" + m); out.push(newRule("model", m, "A model the agent already calls")); }
  return out;
}

export function presetConfig(id: PresetId, a: Pick<Agent, "tools" | "models" | "control" | "name">, by = "jdoe@example.com", network?: string): NetworkConfig {
  const now = new Date().toISOString(); const governed = a.control === "governed";
  const base: NetworkConfig = {
    reach: "internal", network,
    ingress: { auth: ["jwt"], allowCidrs: [], blockCidrs: [], geo: { mode: "off", countries: [] }, rate: { perMin: 600, perIpPerMin: 120 }, maxPayloadKb: 256, shield: { injection: "block", pii: "mask", bots: false }, tls: { min: "1.3", hostname: "" }, originLock: !governed },
    egress: { mode: "allowlist", rules: suggestEgress(a), blockPrivateRanges: true, dnsFilter: true, viaGateway: true, dlp: "log" },
    logging: { logBlocked: true, logAllowed: false, retainDays: 90 }, updatedAt: now, updatedBy: by,
  };
  if (id === "private") return { ...base, reach: "private", ingress: { ...base.ingress, auth: ["mtls"], rate: { perMin: 300, perIpPerMin: 0 }, shield: { injection: "block", pii: "block", bots: false } }, egress: { ...base.egress, dlp: "block" }, logging: { ...base.logging, retainDays: 365 } };
  if (id === "public") return { ...base, reach: "public", ingress: { ...base.ingress, auth: ["api-key", "jwt"], rate: { perMin: 600, perIpPerMin: 60 }, shield: { injection: "block", pii: "mask", bots: true }, tls: { min: "1.3", hostname: `${a.name}.agents.example.com` } }, egress: { ...base.egress, dlp: "block" } };
  if (id === "open") return { ...base, reach: "public", ingress: { ...base.ingress, auth: [], rate: { perMin: 6000, perIpPerMin: 0 }, shield: { injection: "off", pii: "off", bots: false }, tls: { min: "1.2", hostname: "" }, originLock: false }, egress: { mode: "allow-all", rules: [], blockPrivateRanges: false, dnsFilter: false, viaGateway: false, dlp: "off" }, logging: { logBlocked: false, logAllowed: false, retainDays: 7 } };
  return base;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Addresses

export function parseIpv4(s: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s.trim()); if (!m) return null;
  const p = m.slice(1).map(Number); if (p.some((x) => x > 255)) return null;
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}
export function parseCidr(s: string): { base: number; bits: number } | null {
  const m = /^([\d.]+)(?:\/(\d{1,2}))?$/.exec(s.trim()); if (!m) return null;
  const ip = parseIpv4(m[1]); const bits = m[2] === undefined ? 32 : Number(m[2]); if (ip === null || bits > 32) return null;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0; return { base: (ip & mask) >>> 0, bits };
}
export function inCidr(ip: string, cidr: string): boolean {
  const a = parseIpv4(ip), c = parseCidr(cidr); if (a === null || !c) return false;
  const mask = c.bits === 0 ? 0 : (0xffffffff << (32 - c.bits)) >>> 0; return ((a & mask) >>> 0) === c.base;
}
const PRIVATE_RANGES = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "169.254.0.0/16", "100.64.0.0/10", "0.0.0.0/8"];
export const isPrivateAddress = (ip: string) => PRIVATE_RANGES.some((r) => inCidr(ip, r));
/** Hosts that always mean "this machine or the cloud's own control endpoint". A model must never be steered into calling them. */
const INTERNAL_HOSTS = /^(localhost|metadata\.google\.internal|metadata|.*\.internal|.*\.local|.*\.localdomain)$/i;
export const validHost = (h: string) => /^(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(h.trim()) || parseIpv4(h) !== null;
export function hostMatches(pattern: string, host: string): boolean {
  const p = pattern.trim().toLowerCase(), h = host.trim().toLowerCase().replace(/\.$/, "");
  return p.startsWith("*.") ? h.endsWith(p.slice(1)) && h.length > p.length - 1 : p === h;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Validation: what a save must satisfy

export type NetIssue = { path: string; message: string; level: "error" | "warning" };

export function validateNetwork(cfg: NetworkConfig, a: Pick<Agent, "tools" | "control">, networks: AgentNetwork[]): NetIssue[] {
  const out: NetIssue[] = []; const err = (path: string, message: string) => out.push({ path, message, level: "error" }); const warn = (path: string, message: string) => out.push({ path, message, level: "warning" });
  const i = cfg.ingress, e = cfg.egress; const sensitive = a.tools.some((t) => t.sensitive);
  if (cfg.reach === "private") { if (!cfg.network) err("network", "A private agent belongs to a network. Choose one, or create it in Agent networks."); else if (!networks.some((x) => x.id === cfg.network)) err("network", "That network no longer exists."); }
  if (cfg.network && !networks.some((x) => x.id === cfg.network)) err("network", "That network no longer exists.");
  if (cfg.reach === "private" && i.auth.some((x) => x !== "mtls" && x !== "jwt")) warn("ingress.auth", "Members of a private network prove who they are with a certificate or a signed token. An API key is shared and cannot say which agent called.");
  if (cfg.reach === "public" && i.auth.length === 0 && sensitive) err("ingress.auth", "A public agent that can reach a sensitive tool must ask callers to prove who they are.");
  if (cfg.reach === "internal" && i.auth.length === 0) err("ingress.auth", "An internal agent needs the caller to sign in, or it is not internal.");
  for (const c of i.allowCidrs) if (!parseCidr(c)) err("ingress.allowCidrs", `${c} is not an IPv4 address or range such as 203.0.113.0/24.`);
  for (const c of i.blockCidrs) if (!parseCidr(c)) err("ingress.blockCidrs", `${c} is not an IPv4 address or range such as 203.0.113.0/24.`);
  if (i.geo.mode !== "off" && i.geo.countries.length === 0) err("ingress.geo", "Choose at least one country, or turn the country rule off.");
  if (!(i.rate.perMin >= 1 && i.rate.perMin <= 1_000_000)) err("ingress.rate.perMin", "Allow between 1 and 1,000,000 calls a minute.");
  if (!(i.rate.perIpPerMin >= 0 && i.rate.perIpPerMin <= i.rate.perMin)) err("ingress.rate.perIpPerMin", "The limit for one caller is 0 (none) or up to the total limit.");
  if (!(i.maxPayloadKb >= 1 && i.maxPayloadKb <= 20_480)) err("ingress.maxPayloadKb", "A request may be 1 KB to 20 MB.");
  if (i.tls.hostname && !validHost(i.tls.hostname)) err("ingress.tls.hostname", "That is not a host name. Use something like support.agents.example.com.");
  if (cfg.reach === "public" && i.tls.hostname && i.tls.hostname.startsWith("*.")) err("ingress.tls.hostname", "A wildcard cannot be the address of one agent.");
  if (cfg.reach === "public" && i.auth.length === 0) warn("ingress.auth", "Anyone on the internet can call this agent without proving who they are.");
  if (a.control !== "governed" && cfg.reach === "public" && !i.originLock) warn("ingress.originLock", "This agent runs elsewhere. Without an origin lock, anyone who finds its own address can go around the tok∑ner edge.");
  const seen = new Set<string>();
  for (const r of e.rules) {
    const p = `egress.rules.${r.id}`; const key = r.kind + ":" + r.value.trim().toLowerCase();
    if (!r.value.trim()) { err(p, "A rule needs a value."); continue; }
    if (seen.has(key)) err(p, `${r.value} is listed twice.`); seen.add(key);
    if (r.kind === "host" && /^\*\.[a-z]{2,}$/i.test(r.value.trim())) err(p, "A wildcard over a whole top level domain allows the entire internet.");
    else if (r.kind === "host" && !validHost(r.value)) err(p, `${r.value} is not a host name. Use something like api.stripe.com or *.stripe.com.`);
    if (r.kind === "cidr" && !parseCidr(r.value)) err(p, `${r.value} is not an IPv4 range such as 203.0.113.0/24.`);
    if (r.kind === "cidr" && parseCidr(r.value)?.bits === 0) err(p, "0.0.0.0/0 allows every address. Choose Allow everything instead, so the setting says what it does.");
    if (r.kind === "cidr" && e.blockPrivateRanges && isPrivateAddress(r.value.split("/")[0])) warn(p, `${r.value} is a private range and is also blocked by the private range rule. The block wins.`);
    for (const port of r.ports ?? []) if (!(Number.isInteger(port) && port >= 1 && port <= 65535)) err(p, `${port} is not a port.`);
  }
  if (e.mode === "allowlist" && e.rules.length === 0 && a.tools.length > 0) warn("egress.rules", "Nothing is listed, so everything the agent calls will be refused, including its tools.");
  if (e.mode === "allow-all" && sensitive) warn("egress.mode", "This agent can reach a sensitive tool and may call anywhere. A prompt that steers it can send data out.");
  if (a.control !== "governed" && e.mode !== "allow-all") warn("egress.mode", "tok∑ner does not run this agent, so it cannot hold its outbound calls. These rules are recorded and shown, and take effect when it calls through the gateway.");
  if (cfg.logging.retainDays < 1 || cfg.logging.retainDays > 3650) err("logging.retainDays", "Keep the log for 1 to 3,650 days.");
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Posture: how well the setup protects the agent, and what to fix first

export type Severity = "critical" | "high" | "medium" | "low" | "good";
export type Finding = { id: string; severity: Severity; title: string; detail: string; fix?: string; section: "reach" | "ingress" | "egress" | "logging" };
export type Grade = "A" | "B" | "C" | "D" | "E";
export type Posture = { configured: boolean; score: number; grade: Grade | null; findings: Finding[]; reach: Reach | null; label: string };
const COST: Record<Severity, number> = { critical: 40, high: 22, medium: 10, low: 4, good: 0 };
export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "good"];

/** The agents that belong to each network. An agent belongs to the network named in its own setup, so there is one place that says so. */
export function memberCounts(cfgs: Record<string, NetworkConfig | undefined>): Record<string, number> { const o: Record<string, number> = {}; for (const c of Object.values(cfgs)) if (c?.network) o[c.network] = (o[c.network] ?? 0) + 1; return o; }
export function membersOf(netId: string, cfgs: Record<string, NetworkConfig | undefined>): string[] { return Object.entries(cfgs).filter(([, c]) => c?.network === netId).map(([id]) => id); }

export function assess(a: Pick<Agent, "tools" | "control" | "name">, cfg: NetworkConfig | undefined, networks: AgentNetwork[] = [], counts: Record<string, number> = {}): Posture {
  if (!cfg) return { configured: false, score: 0, grade: null, findings: [], reach: null, label: "Not configured" };
  const f: Finding[] = []; const add = (id: string, severity: Severity, title: string, detail: string, section: Finding["section"], fix?: string) => f.push({ id, severity, title, detail, section, fix });
  const i = cfg.ingress, e = cfg.egress; const sensitive = a.tools.some((t) => t.sensitive); const hasTools = a.tools.length > 0; const governed = a.control === "governed";
  const net = networks.find((x) => x.id === cfg.network);

  // Reach and identity
  if (cfg.reach === "private") {
    if (!net) add("private-no-network", "critical", "Private, but in no network", "Nothing can reach this agent, because there is no network whose members may call it.", "reach", "Choose a network.");
    else add("private-ok", "good", `Private to ${net.name}`, `Only the ${counts[net.id] ?? 1} members of the network, and networks peered with it, can call this agent. It has no public address.`, "reach");
  }
  if (cfg.reach !== "private") {
    if (i.auth.length === 0) add("no-auth", cfg.reach === "public" ? "critical" : "high", cfg.reach === "public" ? "Anyone on the internet can call it" : "Anyone can call it without signing in", "No identity is asked for, so nothing can be attributed, limited per caller or revoked.", "ingress", "Require a signed token or an API key.");
    else if (i.auth.length === 1 && i.auth[0] === "api-key" && sensitive) add("weak-auth", "medium", "Only an API key", "A key can be shared or leaked and does not say which person or agent called. This agent can reach a sensitive tool.", "ingress", "Add a signed token (OIDC) or a client certificate.");
    else add("auth-ok", "good", "Callers prove who they are", `Accepted: ${i.auth.map((x) => AUTH_LABEL[x]).join(", ")}.`, "ingress");
  } else if (i.auth.includes("mtls")) add("mtls-ok", "good", "Members prove who they are with certificates", "Each call carries the caller's identity, so the log says which agent called.", "ingress");

  // The shield
  if (cfg.reach !== "private" && hasTools) {
    if (i.shield.injection === "off") add("injection-off", cfg.reach === "public" ? "high" : "medium", "Prompt injection is not checked", "A caller, or text the agent reads, can tell it to ignore its instructions and use its tools.", "ingress", "Turn the shield on in Block mode.");
    else if (i.shield.injection === "log") add("injection-log", "low", "Prompt injection is logged, not blocked", "Attacks are seen but still reach the agent.", "ingress", "Switch to Block once the log looks right.");
    else add("injection-ok", "good", "Prompt injection is blocked", "Requests that try to override the agent's instructions are refused at the edge.", "ingress");
  }
  if (cfg.reach === "public") {
    if (i.rate.perIpPerMin === 0) add("no-ip-limit", "medium", "No limit for a single caller", "One caller can use the whole allowance and starve the others.", "ingress", "Set a limit for each caller.");
    if (!i.shield.bots) add("bots-off", "low", "Bot protection is off", "Automated clients are not told apart from people and well behaved agents.", "ingress", "Turn on bot protection.");
    if (i.tls.min === "1.2") add("tls12", "low", "TLS 1.2 is still accepted", "Older clients can connect, with weaker guarantees.", "ingress", "Require TLS 1.3.");
    if (i.shield.pii === "off" && sensitive) add("pii-off", "medium", "Personal data in requests is not checked", "Card numbers, emails and ID numbers reach the model unmasked.", "ingress", "Mask or block them.");
    if (!governed) { if (!i.originLock) add("origin-open", "high", "The origin can be reached directly", "This agent runs elsewhere. Anyone with its own address can skip the edge and every rule on it.", "ingress", "Turn on the origin lock and accept only the tok∑ner edge."); else add("origin-locked", "good", "Origin lock is on", "The origin accepts calls only from the tok∑ner edge.", "ingress"); }
    if (i.allowCidrs.length > 0 || i.geo.mode !== "off") add("scoped", "good", "Callers are narrowed by place", `${[i.allowCidrs.length ? `${i.allowCidrs.length} address ${i.allowCidrs.length === 1 ? "range" : "ranges"}` : "", i.geo.mode !== "off" ? `${i.geo.mode === "allow" ? "only" : "not"} ${i.geo.countries.length} ${i.geo.countries.length === 1 ? "country" : "countries"}` : ""].filter(Boolean).join(" and ")}.`, "ingress");
  }

  // Egress
  if (e.mode === "allow-all") add("egress-open", sensitive ? "high" : "medium", "The agent may call anywhere", sensitive ? "A steered agent that can reach a sensitive tool could send data to any address." : "Nothing limits where the agent sends what it reads.", "egress", "List what it may reach and refuse the rest.");
  else if (e.mode === "deny-all") add("egress-closed", "good", "Nothing leaves", "The agent cannot call out at all.", "egress");
  else if (e.rules.length === 0 && hasTools) add("egress-empty", "medium", "The allow list is empty", "Everything, including the agent's own tools, will be refused.", "egress", "Add the tools and models it uses.");
  else add("egress-list", "good", "Outbound calls are limited to a list", `${e.rules.length} ${e.rules.length === 1 ? "destination is" : "destinations are"} allowed. Everything else is refused.`, "egress");
  if (e.mode !== "deny-all" && !e.blockPrivateRanges) add("ssrf", "medium", "Private addresses are reachable", "A crafted request could make the agent call the cloud's metadata service or an internal system.", "egress", "Block private ranges.");
  if (e.mode !== "deny-all" && !e.dnsFilter) add("dns", "low", "Domain names are not filtered", "Destinations known for malware and phishing are not refused by name.", "egress", "Turn on name filtering.");
  if (e.mode !== "deny-all" && e.dlp === "off" && sensitive) add("dlp-off", "medium", "Nothing checks what leaves", "Card numbers and personal data in an outbound call are not noticed.", "egress", "Check outbound data in Log or Block mode.");
  if (!governed && e.mode !== "allow-all") add("not-enforced", "low", "Outbound rules are recorded, not enforced", "tok∑ner does not run this agent, so it cannot stop its calls. The rules apply once it calls through the gateway.", "egress");

  // Records
  if (!cfg.logging.logBlocked) add("no-log", "medium", "Blocked calls are not recorded", "An attack that fails leaves no trace to investigate.", "logging", "Log blocked calls.");
  if (cfg.logging.retainDays < 30) add("short-retention", "low", "The log is kept for less than 30 days", "Most investigations look back further.", "logging", "Keep it for at least 90 days.");

  f.sort((x, y) => SEVERITY_ORDER.indexOf(x.severity) - SEVERITY_ORDER.indexOf(y.severity));
  const score = Math.max(0, 100 - f.reduce((t, x) => t + COST[x.severity], 0));
  const grade: Grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 65 ? "C" : score >= 50 ? "D" : "E";
  return { configured: true, score, grade, findings: f, reach: cfg.reach, label: grade === "A" ? "Hardened" : grade === "B" ? "Strong" : grade === "C" ? "Fair" : grade === "D" ? "Weak" : "Exposed" };
}
/** Four buckets for the map and its key: how well an agent is protected, or that nothing is set up. */
export type Bucket = "strong" | "fair" | "weak" | "none";
export const BUCKETS: { id: Bucket; label: string; color: string; blurb: string }[] = [
  { id: "strong", label: "Hardened or strong", color: "#0E9F77", blurb: "Grade A or B." },
  { id: "fair", label: "Fair", color: "#B7791F", blurb: "Grade C. Some gaps to close." },
  { id: "weak", label: "Weak or exposed", color: "#D14343", blurb: "Grade D or E. Fix these first." },
  { id: "none", label: "Not set up", color: "#6B7480", blurb: "No network setup. Open to the organisation." },
];
export const bucketOf = (p: Posture): Bucket => (!p.configured ? "none" : p.grade === "A" || p.grade === "B" ? "strong" : p.grade === "C" ? "fair" : "weak");
export const GRADE_COLOR: Record<Grade, string> = { A: "#0E9F77", B: "#0E9F77", C: "#B7791F", D: "#D9822B", E: "#D14343" };
export const SEVERITY_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low", good: "Good" };

// ---------------------------------------------------------------------------------------------------------------------------------------
// The tester: would this call get through, and which rule decided

export type Step = { rule: string; outcome: "pass" | "block" | "log" | "mask" | "skip"; detail: string };
export type Verdict = { verdict: "allow" | "block"; steps: Step[]; by?: string };
export type CallIn = { ip: string; country: string; auth: IngressAuth | "none"; tls: "1.2" | "1.3"; payloadKb: number; text: string; callerNetwork?: string; callsThisMinute: number; callsFromIp: number; bot: boolean };

const INJECTION = [/ignore (all |any |the )?(previous|prior|above|earlier) (instructions|rules|messages)/i, /(reveal|print|show|repeat) (your |the )?(system|hidden|initial) (prompt|instructions)/i, /you are now (dan|in developer mode|unrestricted)/i, /disregard (the |your )?(system|safety|policy)/i, /act as if you have no (rules|restrictions|guidelines)/i, /(decode|run|execute) (this )?base64/i];
const luhn = (s: string) => { let sum = 0, alt = false; for (let k = s.length - 1; k >= 0; k--) { let d = Number(s[k]); if (alt) { d *= 2; if (d > 9) d -= 9; } sum += d; alt = !alt; } return sum % 10 === 0; };
export function findPii(text: string): string[] {
  const out: string[] = [];
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) out.push("an email address");
  for (const m of text.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) { const d = m[0].replace(/[ -]/g, ""); if (d.length >= 13 && luhn(d)) { out.push("a card number"); break; } }
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) out.push("an ID number");
  return out;
}
export const findInjection = (text: string) => INJECTION.some((r) => r.test(text));

export function testIngress(cfg: NetworkConfig, c: CallIn, networks: AgentNetwork[]): Verdict {
  const steps: Step[] = []; const i = cfg.ingress; const fail = (rule: string, detail: string): Verdict => ({ verdict: "block", steps: [...steps, { rule, outcome: "block", detail }], by: rule });
  const net = networks.find((x) => x.id === cfg.network);
  if (cfg.reach === "private") {
    const ok = !!net && !!c.callerNetwork && (c.callerNetwork === net.id || net.peers.includes(c.callerNetwork) || networks.find((x) => x.id === c.callerNetwork)?.peers.includes(net.id));
    if (!ok) return fail("Private network", net ? `The caller is not a member of ${net.name} or a network peered with it.` : "The agent is in no network, so nobody can call it.");
    steps.push({ rule: "Private network", outcome: "pass", detail: `The caller is inside ${net!.name} or a peer.` });
  } else steps.push({ rule: "Reach", outcome: "pass", detail: cfg.reach === "public" ? "Public: anyone may knock." : "Internal: organisation callers only." });
  if (i.blockCidrs.some((r) => inCidr(c.ip, r))) return fail("Blocked address", `${c.ip} is in a blocked range.`);
  steps.push({ rule: "Blocked addresses", outcome: "pass", detail: i.blockCidrs.length ? "Not in a blocked range." : "None set." });
  if (i.allowCidrs.length && !i.allowCidrs.some((r) => inCidr(c.ip, r))) return fail("Allowed addresses", `${c.ip} is not in an allowed range.`);
  steps.push({ rule: "Allowed addresses", outcome: i.allowCidrs.length ? "pass" : "skip", detail: i.allowCidrs.length ? "In an allowed range." : "Every address is allowed." });
  if (i.geo.mode !== "off") {
    const hit = i.geo.countries.includes(c.country);
    if (i.geo.mode === "allow" ? !hit : hit) return fail("Country", `${COUNTRY_NAME[c.country] ?? c.country} is ${i.geo.mode === "allow" ? "not on the allowed list" : "blocked"}.`);
    steps.push({ rule: "Country", outcome: "pass", detail: `${COUNTRY_NAME[c.country] ?? c.country} is permitted.` });
  } else steps.push({ rule: "Country", outcome: "skip", detail: "No country rule." });
  if (i.shield.bots && c.bot) return fail("Bot protection", "The client looks automated and is not a known agent.");
  if (i.tls.min === "1.3" && c.tls === "1.2") return fail("TLS version", "This agent requires TLS 1.3.");
  if (i.auth.length) {
    if (c.auth === "none" || !i.auth.includes(c.auth)) return fail("Identity", c.auth === "none" ? "The caller did not prove who it is." : `${AUTH_LABEL[c.auth]} is not accepted here. Accepted: ${i.auth.map((x) => AUTH_LABEL[x]).join(", ")}.`);
    steps.push({ rule: "Identity", outcome: "pass", detail: `Accepted ${AUTH_LABEL[c.auth]}.` });
  } else steps.push({ rule: "Identity", outcome: "skip", detail: "No identity is asked for." });
  if (c.payloadKb > i.maxPayloadKb) return fail("Request size", `${c.payloadKb} KB is over the ${i.maxPayloadKb} KB limit.`);
  if (c.callsThisMinute >= i.rate.perMin) return fail("Rate limit", `${c.callsThisMinute} calls this minute, and the limit is ${i.rate.perMin}.`);
  if (i.rate.perIpPerMin > 0 && c.callsFromIp >= i.rate.perIpPerMin) return fail("Rate limit for one caller", `${c.callsFromIp} calls from this address this minute, and the limit is ${i.rate.perIpPerMin}.`);
  steps.push({ rule: "Rate limits", outcome: "pass", detail: "Within the limits." });
  if (i.shield.injection !== "off" && findInjection(c.text)) {
    if (i.shield.injection === "block") return fail("Prompt injection shield", "The text tries to override the agent's instructions.");
    steps.push({ rule: "Prompt injection shield", outcome: "log", detail: "The text tries to override the agent's instructions. Logged, and let through." });
  } else steps.push({ rule: "Prompt injection shield", outcome: i.shield.injection === "off" ? "skip" : "pass", detail: i.shield.injection === "off" ? "The shield is off." : "No attempt found." });
  const pii = i.shield.pii === "off" ? [] : findPii(c.text);
  if (pii.length) {
    if (i.shield.pii === "block") return fail("Personal data", `The request contains ${pii.join(" and ")}.`);
    steps.push({ rule: "Personal data", outcome: i.shield.pii === "mask" ? "mask" : "log", detail: `The request contains ${pii.join(" and ")}. ${i.shield.pii === "mask" ? "Masked before the model sees it." : "Logged, and let through."}` });
  } else steps.push({ rule: "Personal data", outcome: i.shield.pii === "off" ? "skip" : "pass", detail: i.shield.pii === "off" ? "Not checked." : "None found." });
  return { verdict: "allow", steps };
}

export type OutCall = { destination: string; port: number; body?: string };
export function testEgress(cfg: NetworkConfig, c: OutCall): Verdict {
  const e = cfg.egress; const steps: Step[] = []; const dest = c.destination.trim(); const fail = (rule: string, detail: string): Verdict => ({ verdict: "block", steps: [...steps, { rule, outcome: "block", detail }], by: rule });
  if (e.mode === "deny-all") return fail("Outbound closed", "This agent may not call out.");
  const ip = parseIpv4(dest) !== null;
  if (e.blockPrivateRanges && ((ip && isPrivateAddress(dest)) || INTERNAL_HOSTS.test(dest))) return fail("Private ranges", `${dest} is a private or internal address. Blocked, so the agent cannot be steered into an internal system.`);
  steps.push({ rule: "Private ranges", outcome: e.blockPrivateRanges ? "pass" : "skip", detail: e.blockPrivateRanges ? "Not a private address." : "Not checked." });
  if (e.dnsFilter && /\.(zip|mov|tk|gq|ml|cf)$/i.test(dest)) return fail("Domain filter", `${dest} ends in a name that is mostly used for abuse.`);
  steps.push({ rule: "Domain filter", outcome: e.dnsFilter ? "pass" : "skip", detail: e.dnsFilter ? "Not a known bad name." : "Not checked." });
  if (e.mode === "allowlist") {
    const hit = e.rules.find((r) => (r.kind === "host" && hostMatches(r.value, dest)) || (r.kind === "cidr" && ip && inCidr(dest, r.value)) || ((r.kind === "mcp" || r.kind === "model" || r.kind === "agent") && r.value.toLowerCase() === dest.toLowerCase()));
    if (!hit) return fail("Allow list", `${dest} is not on the list.`);
    if (hit.ports?.length && !hit.ports.includes(c.port)) return fail("Allow list", `${dest} is allowed on ports ${hit.ports.join(", ")}, not ${c.port}.`);
    steps.push({ rule: "Allow list", outcome: "pass", detail: `Matches ${RULE_KIND[hit.kind].label.toLowerCase()} ${hit.value}.` });
  } else steps.push({ rule: "Allow list", outcome: "skip", detail: "Everything is allowed." });
  const pii = e.dlp === "off" || !c.body ? [] : findPii(c.body);
  if (pii.length) {
    if (e.dlp === "block") return fail("Data leaving", `The call carries ${pii.join(" and ")}.`);
    steps.push({ rule: "Data leaving", outcome: "log", detail: `The call carries ${pii.join(" and ")}. Logged, and let through.` });
  } else steps.push({ rule: "Data leaving", outcome: e.dlp === "off" ? "skip" : "pass", detail: e.dlp === "off" ? "Not checked." : "Nothing sensitive found." });
  return { verdict: "allow", steps };
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// The paths between agents, seen through the networks

export type PathState = "private" | "peered" | "blocked" | "public" | "internal" | "open";
export type PathLink = { id: string; from: string; to: string };
export type PathInfo = { id: string; from: string; to: string; state: PathState; detail: string };

/** How a call from one agent to another crosses the network boundaries. A private agent accepts only its network and peers; a public one is reached at its edge; an agent with no setup is open. */
export function pathOf(l: PathLink, cfgs: Record<string, NetworkConfig | undefined>, networks: AgentNetwork[]): PathInfo {
  const f = cfgs[l.from], t = cfgs[l.to]; const mk = (state: PathState, detail: string): PathInfo => ({ id: l.id, from: l.from, to: l.to, state, detail });
  if (!t) return mk("open", "The receiving agent has no network setup, so any caller in the organisation can reach it.");
  if (t.reach === "private") {
    const tn = networks.find((x) => x.id === t.network); const fn = f?.network ? networks.find((x) => x.id === f.network) : undefined;
    if (!tn) return mk("blocked", "The receiving agent is private and in no network.");
    if (!fn) return mk("blocked", `The receiving agent is private to ${tn.name}. The caller is in no network.`);
    if (fn.id === tn.id) return mk("private", `Both are in ${tn.name}.`);
    if (tn.peers.includes(fn.id) || fn.peers.includes(tn.id)) return mk("peered", `${fn.name} is peered with ${tn.name}.`);
    return mk("blocked", `${fn.name} is not peered with ${tn.name}.`);
  }
  return t.reach === "public" ? mk("public", "Through the public edge, with identity, limits and the shield.") : mk("internal", "Through the gateway, with the caller's organisation identity.");
}
export const PATH_LABEL: Record<PathState, string> = { private: "Private", peered: "Peered", blocked: "Blocked", public: "Public edge", internal: "Internal", open: "Open" };

// ---------------------------------------------------------------------------------------------------------------------------------------
// Security events for the sample workspace. Counts follow the agent's own traffic and are the same on every load. Nothing here is a measurement.

export type SecurityEvent = { id: string; at: string; control: string; action: "blocked" | "logged" | "passed"; detail: string; source: string };
export type SecuritySummary = { requests: number; blocked: number; logged: number; unchecked: number; byControl: { control: string; count: number; action: "blocked" | "logged" | "passed" }[]; events: SecurityEvent[] };

const seeded = (seed: string) => { let h = 2166136261; for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; };
const IPS = ["198.51.100.23", "203.0.113.77", "192.0.2.14", "198.51.100.200", "203.0.113.9", "192.0.2.201"];
const CTRY = ["US", "GB", "DE", "RU", "CN", "BR", "NL", "IN"];

export function sampleSecurity(a: Pick<Agent, "id" | "daily">, cfg: NetworkConfig | undefined, now = Date.now()): SecuritySummary {
  const today = a.daily[a.daily.length - 1]?.executions ?? 0; const rnd = seeded(a.id + "sec");
  if (!cfg) return { requests: today, blocked: 0, logged: 0, unchecked: today, byControl: [], events: [] };
  const exposed = cfg.reach === "public" ? 1 : cfg.reach === "internal" ? 0.35 : 0.1;
  const requests = Math.round(today * (1 + rnd() * 0.3)) + 40;
  const i = cfg.ingress; const e = cfg.egress;
  const raw: { control: string; n: number; mode: "blocked" | "logged" | "passed"; detail: string }[] = [
    { control: "Prompt injection shield", n: Math.round(requests * 0.011 * exposed * (0.6 + rnd())), mode: i.shield.injection === "block" ? "blocked" : i.shield.injection === "log" ? "logged" : "passed", detail: "Asked the agent to ignore its instructions" },
    { control: "Rate limit", n: Math.round(requests * 0.006 * exposed * (0.5 + rnd())), mode: "blocked", detail: `Over ${i.rate.perIpPerMin || i.rate.perMin} calls a minute` },
    { control: "Identity", n: i.auth.length ? Math.round(requests * 0.009 * exposed * (0.5 + rnd())) : 0, mode: "blocked", detail: "No valid key or token" },
    { control: "Country", n: i.geo.mode === "off" ? 0 : Math.round(requests * 0.008 * exposed * (0.5 + rnd())), mode: "blocked", detail: "From a country the rule refuses" },
    { control: "Bot protection", n: i.shield.bots ? Math.round(requests * 0.007 * exposed * (0.5 + rnd())) : 0, mode: "blocked", detail: "Automated client that is not a known agent" },
    { control: "Personal data", n: Math.round(requests * 0.004 * (0.5 + rnd())), mode: i.shield.pii === "block" ? "blocked" : i.shield.pii === "mask" ? "logged" : i.shield.pii === "log" ? "logged" : "passed", detail: i.shield.pii === "mask" ? "Masked before the model saw it" : "Card or ID number in a request" },
    { control: "Outbound allow list", n: e.mode === "allowlist" ? Math.round(requests * 0.003 * (0.5 + rnd())) : 0, mode: "blocked", detail: "The agent tried to call a destination that is not listed" },
    { control: "Private ranges", n: e.blockPrivateRanges ? Math.round(requests * 0.0008 * (0.2 + rnd())) : 0, mode: "blocked", detail: "The agent was steered towards an internal address" },
  ];
  const byControl = raw.filter((r) => r.n > 0).map((r) => ({ control: r.control, count: r.n, action: r.mode }));
  const sum = (m: string) => byControl.filter((b) => b.action === m).reduce((t, b) => t + b.count, 0);
  const events: SecurityEvent[] = [];
  for (const r of raw) for (let k = 0; k < Math.min(3, r.n); k++) {
    const mins = Math.floor(rnd() * 1380) + 1;
    events.push({ id: `${a.id}-${r.control}-${k}`, at: new Date(now - mins * 60_000).toISOString(), control: r.control, action: r.mode, detail: r.detail, source: r.control.startsWith("Outbound") || r.control === "Private ranges" ? "the agent" : `${IPS[Math.floor(rnd() * IPS.length)]} (${CTRY[Math.floor(rnd() * CTRY.length)]})` });
  }
  events.sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
  return { requests, blocked: sum("blocked"), logged: sum("logged"), unchecked: sum("passed"), byControl, events: events.slice(0, 12) };
}

/** One word for a list or a badge. */
export const reachLabel = (r: Reach | null | undefined) => (r ? REACH.find((x) => x.id === r)!.label : "Not set up");

// ---------------------------------------------------------------------------------------------------------------------------------------
// Sample networks, for the sample workspace

export function sampleNetworks(): AgentNetwork[] {
  const at = new Date(Date.now() - 40 * 86_400_000).toISOString();
  return [
    { id: "net_fin", name: "Finance core", description: "Agents that decide, match and pay. Closed to everything else.", kind: "private", identity: "mtls", peers: ["net_sup", "net_clm"], owner: "Finance platform", createdAt: at },
    { id: "net_sup", name: "Support edge", description: "Customer facing agents, allowed to hand a refund to Finance core.", kind: "shared", identity: "jwt", peers: ["net_fin"], owner: "Support engineering", createdAt: at },
    { id: "net_clm", name: "Claims", description: "Claims intake, document processing and the policy wording check, including the cloud agent that sends packs in. Peered with Finance core so a payout can be prepared.", kind: "private", identity: "mtls", peers: ["net_fin"], owner: "Operations", createdAt: at },
  ];
}
export function sampleNetworkConfigs(agents: Pick<Agent, "id" | "name" | "tools" | "models" | "control">[]): Record<string, NetworkConfig> {
  const by = new Map(agents.map((a) => [a.id, a])); const out: Record<string, NetworkConfig> = {}; const stamp = new Date(Date.now() - 9 * 86_400_000).toISOString();
  const put = (id: string, cfg: NetworkConfig) => { out[id] = { ...cfg, updatedAt: stamp, updatedBy: "security@nexi.com" }; };
  const A = (id: string) => by.get(id)!;
  put("agt_01", { ...presetConfig("public", A("agt_01")), network: "net_sup", ingress: { ...presetConfig("public", A("agt_01")).ingress, geo: { mode: "block", countries: ["KP", "IR"] }, tls: { min: "1.3", hostname: "support.agents.acme.example" } } });
  put("agt_02", presetConfig("private", A("agt_02"), "security@nexi.com", "net_fin"));
  put("agt_05", presetConfig("private", A("agt_05"), "security@nexi.com", "net_fin"));
  put("agt_07", { ...presetConfig("internal", A("agt_07")), network: "net_sup" });
  put("agt_03", presetConfig("private", A("agt_03"), "security@nexi.com", "net_clm"));
  put("agt_09", presetConfig("private", A("agt_09"), "security@nexi.com", "net_clm"));
  put("agt_15", presetConfig("private", A("agt_15"), "security@nexi.com", "net_clm"));
  const eight = presetConfig("public", A("agt_08")); put("agt_08", { ...eight, ingress: { ...eight.ingress, originLock: false, shield: { injection: "log", pii: "log", bots: false }, tls: { ...eight.ingress.tls, min: "1.2" } }, egress: { ...eight.egress, mode: "allow-all", rules: [], dlp: "off" } });
  const faq = presetConfig("open", A("agt_11")); put("agt_11", faq);
  return out;
}
