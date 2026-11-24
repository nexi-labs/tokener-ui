import type { Hub } from "./connectors";
import type { Agent } from "./types";

/**
 * Shared context for agents. Agents that work on the same case, conversation or team need the same facts without passing megabytes through every message.
 * A space is a named, access-controlled place for that context, kept in tiers:
 *
 *   hot   a fast key and value cache (Redis, or the managed cache). Expires. Holds state and small payloads. Not the system of record.
 *   warm  the durable store (the managed store or PostgreSQL). Survives restarts and can be searched. The system of record for the space.
 *   blob  object storage. Large documents and files are stored once and travel between agents as a short reference, the claim check pattern.
 *
 * Reads go to hot first and fall through to warm. Writes go to warm and, for state read again soon, to hot as well. A payload above the claim-check
 * threshold is stored in the blob tier and only its reference is written to the other tiers, so a message between two agents stays small.
 */

export type Tier = "hot" | "warm" | "blob";
export type Scope = "case" | "session" | "team" | "organisation";
export type Access = "read" | "write";
export type Consistency = "last-write-wins" | "versioned";
export type Eviction = "lru" | "ttl" | "reject";
export type PayloadKind = "state" | "message" | "document";

export type Space = {
  id: string;
  name: string;
  purpose: string;
  scope: Scope;
  /** The project in Organization that owns the space. An agent from another project cannot join. */
  project?: string;
  members: { agentId: string; access: Access }[];
  hot: { enabled: boolean; backend: "managed" | "redis"; connection?: string; ttlSec: number; maxMb: number; eviction: Eviction };
  warm: { enabled: boolean; backend: "managed" | "pgvector"; connection?: string; retentionDays: number | null };
  blob: { enabled: boolean; connection?: string; claimCheckAboveKb: number; retentionDays: number | null };
  consistency: Consistency;
  maskPersonalData: boolean;
  createdAt: string;
};

export const SCOPES: { id: Scope; label: string; help: string }[] = [
  { id: "case", label: "One case", help: "A claim, a ticket or an order. Ends when the case closes." },
  { id: "session", label: "One conversation", help: "Shared by the agents serving one conversation." },
  { id: "team", label: "A team", help: "Agents that work together every day." },
  { id: "organisation", label: "The organisation", help: "Readable by any agent with a grant. Personal data must be masked." },
];

export const TIERS: { id: Tier; label: string; store: string; latency: string; durable: boolean; max: string; role: string }[] = [
  { id: "hot", label: "Hot", store: "Redis or the managed cache", latency: "1 to 3 ms", durable: false, max: "512 KB per item", role: "Current state and small payloads read again and again. Expires, so it never grows without limit." },
  { id: "warm", label: "Warm", store: "The managed store or PostgreSQL", latency: "10 to 30 ms", durable: true, max: "4 MB per item", role: "The record of the space. Survives restarts, versioned, and can be searched." },
  { id: "blob", label: "Blob", store: "S3-compatible object storage", latency: "60 to 150 ms", durable: true, max: "5 GB per object", role: "Documents and files. Stored once. Agents pass a reference, not the file." },
];

export const HOT_MAX_KB = 512; export const WARM_MAX_KB = 4096;

export const defaultSpace = (id: string, name: string, now = new Date().toISOString()): Space => ({
  id, name, purpose: "", scope: "case", members: [],
  hot: { enabled: true, backend: "managed", ttlSec: 3600, maxMb: 128, eviction: "lru" },
  warm: { enabled: true, backend: "managed", retentionDays: 30 },
  blob: { enabled: false, claimCheckAboveKb: 64, retentionDays: 30 },
  consistency: "versioned", maskPersonalData: true, createdAt: now,
});

export type Placement = { tier: Tier; also: Tier[]; claimCheck: boolean; reason: string; error?: string; ref?: string };

/** Where a payload of this size and kind is stored, and what travels between agents in its place. */
export function planWrite(s: Space, input: { bytes: number; kind: PayloadKind; readAgain?: boolean }): Placement {
  const kb = input.bytes / 1024;
  const big = s.blob.enabled && kb > s.blob.claimCheckAboveKb;
  if (input.kind === "document" && !s.blob.enabled) return { tier: "warm", also: [], claimCheck: false, reason: "", error: "This space has no blob tier, so it cannot hold documents. Turn the blob tier on, or keep documents where they are and pass their address." };
  if (big || input.kind === "document") {
    const ref = `ctx://${s.id}/blob/${hash(`${s.id}:${input.bytes}:${input.kind}`)}`;
    return { tier: "blob", also: s.warm.enabled ? ["warm"] : s.hot.enabled ? ["hot"] : [], claimCheck: true, ref, reason: `${fmt(kb)} is above the ${s.blob.claimCheckAboveKb} KB claim-check threshold${input.kind === "document" ? ", and documents always go to the blob tier" : ""}. The file is stored once, and a reference of about 90 bytes is written to the ${s.warm.enabled ? "warm" : "hot"} tier and passed between agents.` };
  }
  if (!s.hot.enabled && !s.warm.enabled) return { tier: "warm", also: [], claimCheck: false, reason: "", error: "This space has no hot or warm tier, so there is nowhere to write." };
  if (kb > WARM_MAX_KB) return { tier: "warm", also: [], claimCheck: false, reason: "", error: `${fmt(kb)} is above the ${WARM_MAX_KB / 1024} MB limit for an item. Turn the blob tier on so it is stored as a file.` };
  const hotOk = s.hot.enabled && kb <= HOT_MAX_KB && (input.readAgain ?? input.kind !== "message");
  if (hotOk && s.warm.enabled) return { tier: "warm", also: ["hot"], claimCheck: false, reason: `${fmt(kb)} of ${input.kind === "state" ? "state" : "context"} that is read again soon. Written to the warm tier as the record and to the hot tier for fast reads, expiring after ${dur(s.hot.ttlSec)}.` };
  if (hotOk) return { tier: "hot", also: [], claimCheck: false, reason: `${fmt(kb)}, kept in the hot tier only. It expires after ${dur(s.hot.ttlSec)} and is not recoverable after that.` };
  if (s.warm.enabled) return { tier: "warm", also: [], claimCheck: false, reason: `${fmt(kb)} ${input.kind === "message" ? "message, read once by the next agent" : "item"}. Written to the warm tier only, so it is not taking cache space.` };
  return { tier: "hot", also: [], claimCheck: false, reason: `${fmt(kb)}, kept in the hot tier because the space has no warm tier. It expires after ${dur(s.hot.ttlSec)}.` };
}

const fmt = (kb: number) => (kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : kb >= 10 ? `${Math.round(kb)} KB` : `${kb.toFixed(1)} KB`);
const dur = (s: number) => (s >= 86_400 ? `${Math.round(s / 86_400)} days` : s >= 3600 ? `${Math.round(s / 3600)} hours` : `${Math.round(s / 60)} minutes`);
function hash(s: string) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0") + (Math.imul(h, 2654435761) >>> 0).toString(16).padStart(8, "0"); }

export type SpaceIssue = { level: "error" | "warning"; message: string; path?: string };

export function validateSpace(s: Space, agents: Pick<Agent, "id" | "title" | "project" | "state" | "control">[], hub: Hub): SpaceIssue[] {
  const out: SpaceIssue[] = []; const err = (message: string, path?: string) => out.push({ level: "error", message, path }); const warn = (message: string, path?: string) => out.push({ level: "warning", message, path });
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(s.id)) err("Use 2 to 63 lowercase letters, digits and hyphens for the id.", "id");
  if (!s.name.trim()) err("Give the space a name.", "name");
  if (!s.hot.enabled && !s.warm.enabled) err("Turn on the hot or the warm tier. The blob tier alone cannot hold state.", "tiers");
  if (s.hot.enabled) {
    if (!(s.hot.ttlSec >= 10)) err("Hot items must expire. Set a time to live of at least 10 seconds, or the cache fills up for ever.", "hot.ttlSec");
    if (s.hot.ttlSec > 7 * 86_400) warn("A time to live over seven days is a store, not a cache. Use the warm tier for that.", "hot.ttlSec");
    if (!(s.hot.maxMb >= 1)) err("Give the hot tier a size limit of at least 1 MB.", "hot.maxMb");
    if (s.hot.backend === "redis") {
      const c = hub.connections.find((x) => x.id === s.hot.connection);
      if (!s.hot.connection) err("Choose the Redis connection from Integrations.", "hot.connection");
      else if (!c) err("That connection is not in Integrations any more.", "hot.connection");
      else { if (c.integrationId !== "redis") err(`${c.name} is ${c.integrationName}, not Redis.`, "hot.connection"); if (c.permissions === "read-only") err(`${c.name} is read-only, and the hot tier must write.`, "hot.connection"); if (c.health === "failed" || c.health === "offline") err(`${c.name} is not reachable: ${c.healthDetail}`, "hot.connection"); }
    }
    if (!s.warm.enabled && s.consistency === "versioned") warn("Versioned writes need the warm tier to keep the versions. Without it, the hot tier keeps only the latest.", "consistency");
    if (s.hot.eviction === "reject") warn("When the hot tier is full, writes are refused. Agents see an error instead of losing old items.", "hot.eviction");
  }
  if (s.warm.enabled && s.warm.backend === "pgvector") {
    const c = hub.connections.find((x) => x.id === s.warm.connection);
    if (!s.warm.connection || !c) err("Choose the PostgreSQL connection from Integrations.", "warm.connection");
    else { if (!["pgvector", "postgres"].includes(c.integrationId)) err(`${c.name} is ${c.integrationName}, not PostgreSQL.`, "warm.connection"); if (c.env !== "production") warn(`${c.name} is a ${c.env} database.`, "warm.connection"); }
  }
  if (s.blob.enabled) {
    const c = hub.connections.find((x) => x.id === s.blob.connection);
    if (!s.blob.connection) err("Choose the object storage connection from Integrations.", "blob.connection");
    else if (!c) err("That connection is not in Integrations any more.", "blob.connection");
    else { if (c.integrationId !== "s3") err(`${c.name} is ${c.integrationName}, not object storage.`, "blob.connection"); if (c.permissions === "read-only") err(`${c.name} is read-only, and claim-check payloads must be written.`, "blob.connection"); }
    if (!(s.blob.claimCheckAboveKb >= 4 && s.blob.claimCheckAboveKb <= HOT_MAX_KB)) err(`Set the claim-check threshold between 4 and ${HOT_MAX_KB} KB.`, "blob.claimCheckAboveKb");
  }
  if (s.members.length === 0) warn("No agent is a member yet, so nothing reads or writes this space.", "members");
  else if (!s.members.some((m) => m.access === "write")) warn("Every member can only read. Add an agent that writes.", "members");
  const seen = new Set<string>();
  for (const m of s.members) {
    const a = agents.find((x) => x.id === m.agentId);
    if (seen.has(m.agentId)) err(`${a?.title ?? m.agentId} is listed twice.`, "members"); seen.add(m.agentId);
    if (!a) { err(`${m.agentId} is not in the registry.`, "members"); continue; }
    if (a.state === "retired") err(`${a.title} is retired and cannot be a member.`, "members");
    if (s.project && a.project && a.project !== s.project) err(`${a.title} belongs to the project ${a.project}, and this space belongs to ${s.project}. Context does not cross projects.`, "members");
    if (m.access === "write" && a.control !== "governed") warn(`${a.title} does not pass through tok∑ner, so its writes cannot be checked against this space's rules.`, "members");
  }
  if (s.scope === "organisation" && !s.maskPersonalData) err("A space the whole organisation can read must mask personal data.", "maskPersonalData");
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Sample content

export type ContextItem = { key: string; kind: PayloadKind; bytes: number; by: string; version: number; at: string; placement: Placement; note: string };

export function sampleItems(s: Space, now = Date.now()): ContextItem[] {
  const rows: { key: string; kind: PayloadKind; kb: number; by?: string; note: string; age: number }[] = s.id === "claims-case"
    ? [{ key: "claim/CLM-24-00871/state", kind: "state", kb: 3.4, by: "agt_15", note: "Where the pack is in the review", age: 2 }, { key: "claim/CLM-24-00871/extracted", kind: "state", kb: 18, by: "agt_15", note: "Values read from the pack", age: 5 }, { key: "claim/CLM-24-00871/pack.pdf", kind: "document", kb: 2_480, by: "agt_09", note: "The claim pack as received", age: 14 }, { key: "claim/CLM-24-00871/photos", kind: "document", kb: 6_100, by: "agt_09", note: "Photos from the claimant", age: 14 }, { key: "claim/CLM-24-00871/notes", kind: "message", kb: 1.2, by: "agt_09", note: "Hand-off note from intake", age: 15 }, { key: "claim/CLM-24-00902/state", kind: "state", kb: 3.1, by: "agt_15", note: "Waiting on the invoice date finding", age: 41 }]
    : s.id === "support-session" ? [{ key: "conv/8841/summary", kind: "state", kb: 2.2, by: "agt_01", note: "Conversation so far, folded", age: 1 }, { key: "conv/8841/customer", kind: "state", kb: 0.9, by: "agt_08", note: "Who is asking and their plan", age: 3 }, { key: "conv/8841/draft", kind: "message", kb: 1.6, by: "agt_01", note: "Draft reply for a person", age: 2 }, { key: "conv/8841/attachment.png", kind: "document", kb: 940, by: "agt_08", note: "Screenshot from the customer", age: 6 }]
      : [{ key: "queue/pricing/inputs", kind: "state", kb: 22, by: "agt_13", note: "Inputs for the next pricing run", age: 9 }, { key: "queue/pricing/notes", kind: "message", kb: 0.8, by: "agt_13", note: "Note for the approver", age: 10 }];
  return rows.map((r) => ({ key: r.key, kind: r.kind, bytes: Math.round(r.kb * 1024), by: r.by ?? s.members[0]?.agentId ?? "", version: 1 + (r.key.length % 4), at: new Date(now - r.age * 60_000).toISOString(), placement: planWrite(s, { bytes: Math.round(r.kb * 1024), kind: r.kind }), note: r.note }));
}

export function sampleSpaces(now = new Date().toISOString()): Space[] {
  const base = (id: string, name: string) => defaultSpace(id, name, now);
  return [
    { ...base("claims-case", "Claims case file"), purpose: "What the claims agents know about one claim: its state, the values read from the pack and the pack itself.", scope: "case", project: "claims-ops",
      members: [{ agentId: "agt_09", access: "write" }, { agentId: "agt_15", access: "write" }],
      hot: { enabled: true, backend: "redis", connection: "conn-prod-redis", ttlSec: 4 * 3600, maxMb: 512, eviction: "lru" }, warm: { enabled: true, backend: "managed", retentionDays: 90 },
      blob: { enabled: true, connection: "conn-prod-s3-context", claimCheckAboveKb: 64, retentionDays: 365 }, consistency: "versioned", maskPersonalData: true },
    { ...base("support-session", "Support conversation"), purpose: "The summary, customer facts and drafts that the support agents hand to each other during one conversation.", scope: "session",
      members: [{ agentId: "agt_01", access: "write" }, { agentId: "agt_08", access: "write" }, { agentId: "agt_11", access: "read" }],
      hot: { enabled: true, backend: "managed", ttlSec: 2 * 3600, maxMb: 128, eviction: "ttl" }, warm: { enabled: true, backend: "managed", retentionDays: 30 }, blob: { enabled: true, connection: "conn-prod-s3-context", claimCheckAboveKb: 128, retentionDays: 30 }, consistency: "last-write-wins", maskPersonalData: true },
    { ...base("finance-queue", "Finance working notes"), purpose: "Inputs and notes the finance agents leave for each other between runs.", scope: "team",
      members: [{ agentId: "agt_13", access: "write" }, { agentId: "agt_05", access: "read" }],
      hot: { enabled: true, backend: "managed", ttlSec: 86_400, maxMb: 64, eviction: "lru" }, warm: { enabled: true, backend: "managed", retentionDays: 14 }, blob: { enabled: false, claimCheckAboveKb: 64, retentionDays: 30 }, consistency: "versioned", maskPersonalData: true },
  ];
}
