import type { ToolGrant } from "./types";

/**
 * What an agent remembers, where it is kept and for how long. An agent has up to six layers, one per kind of memory, and each layer has its own
 * scope, store, retention and write rule. The agent reaches memory through a small set of tools served by the tok∑ner memory server, so the same
 * calls work on every framework and every call passes through the gateway, where policy, masking and audit apply.
 */

export type MemoryKind = "working" | "conversation" | "semantic" | "episodic" | "entity" | "procedural";
export type MemoryScope = "run" | "session" | "user" | "agent" | "organisation";
export type MemoryBackend = "managed" | "pgvector" | "redis" | "qdrant" | "pinecone" | "opensearch";
export type WriteRule = "automatic" | "on-request" | "approval";
export type RecallStrategy = "similarity" | "recency" | "hybrid";

export type MemoryLayer = {
  kind: MemoryKind;
  enabled: boolean;
  backend: MemoryBackend;
  /** An Integrations connection, for any backend except the managed one. The credential stays in the secret manager. */
  connection?: string;
  scope: MemoryScope;
  /** Days an item is kept after it was last used. Null keeps it until someone removes it. */
  retentionDays: number | null;
  maxItems: number | null;
  write: WriteRule;
  topK: number;
  minScore: number;
  strategy: RecallStrategy;
  maskPersonalData: boolean;
  embeddingModel?: string;
  /** Conversation memory only: older turns are folded into a summary after this many. */
  summariseAfterTurns?: number;
};

export type MemoryToolId = "remember" | "recall" | "update" | "forget" | "list" | "summarise";

export type MemoryConfig = {
  layers: MemoryLayer[];
  tools: Record<MemoryToolId, boolean>;
  /** Memory is separated by namespace, so two agents never read each other's by accident. */
  namespace: string;
  region: string;
  customerKey: boolean;
};

export type MemoryKindInfo = { id: MemoryKind; label: string; what: string; example: string; defaultScope: MemoryScope; vector: boolean; defaultBackend: MemoryBackend; defaultRetention: number | null };

export const MEMORY_KINDS: MemoryKindInfo[] = [
  { id: "working", label: "Working memory", what: "A scratchpad for the run in progress: intermediate results, the plan, what has been tried.", example: "The invoice numbers found so far in this request.", defaultScope: "run", vector: false, defaultBackend: "managed", defaultRetention: 1 },
  { id: "conversation", label: "Conversation memory", what: "The turns of the current conversation, folded into a summary as it grows so the context window stays small.", example: "The customer already said the order was delivered late.", defaultScope: "session", vector: false, defaultBackend: "managed", defaultRetention: 30 },
  { id: "semantic", label: "Semantic memory", what: "Facts and documents found by meaning. The agent asks a question and gets the closest items back.", example: "The refund policy for orders above 500 dollars.", defaultScope: "agent", vector: true, defaultBackend: "managed", defaultRetention: null },
  { id: "episodic", label: "Episodic memory", what: "What happened before: past tasks, how they went, what the person decided.", example: "Last time this customer asked for a refund, a person declined it.", defaultScope: "user", vector: true, defaultBackend: "managed", defaultRetention: 180 },
  { id: "entity", label: "Entity memory", what: "What the agent knows about a person, company or thing, kept as one record per entity.", example: "Acme Ltd prefers invoices in euros and a net 45 term.", defaultScope: "organisation", vector: false, defaultBackend: "managed", defaultRetention: null },
  { id: "procedural", label: "Procedural memory", what: "How to do things: playbooks and corrections the agent has been taught.", example: "When a refund is above 1,000 dollars, ask for a second approver.", defaultScope: "agent", vector: true, defaultBackend: "managed", defaultRetention: null },
];
export const KIND_BY_ID = Object.fromEntries(MEMORY_KINDS.map((k) => [k.id, k])) as Record<MemoryKind, MemoryKindInfo>;

export const SCOPES: { id: MemoryScope; label: string; help: string }[] = [
  { id: "run", label: "One run", help: "Gone when the run ends." },
  { id: "session", label: "One conversation", help: "Shared by every run in the same session." },
  { id: "user", label: "One person", help: "Follows the person the agent acts for, across sessions." },
  { id: "agent", label: "This agent", help: "Shared by every run of this agent, for everyone." },
  { id: "organisation", label: "The organisation", help: "Readable by any agent with the memory tool. Personal data must be masked." },
];

export const BACKENDS: { id: MemoryBackend; label: string; vector: boolean; kv: boolean; note: string }[] = [
  { id: "managed", label: "tok∑ner managed", vector: true, kv: true, note: "Encrypted, kept in the region you choose, with nothing for you to run." },
  { id: "pgvector", label: "PostgreSQL with pgvector", vector: true, kv: true, note: "Your own database, reached through an Integrations connection." },
  { id: "redis", label: "Redis", vector: false, kv: true, note: "Fast and short lived. Good for working and conversation memory." },
  { id: "qdrant", label: "Qdrant", vector: true, kv: false, note: "A vector store you run or rent." },
  { id: "pinecone", label: "Pinecone", vector: true, kv: false, note: "A hosted vector store." },
  { id: "opensearch", label: "OpenSearch", vector: true, kv: true, note: "Search and vectors in one cluster." },
];
export const BACKEND_BY_ID = Object.fromEntries(BACKENDS.map((b) => [b.id, b])) as Record<MemoryBackend, (typeof BACKENDS)[number]>;

export const EMBEDDING_MODELS = ["text-embedding-3-small", "text-embedding-3-large", "embed-english-v3", "bge-m3"];

export type MemoryTool = { id: MemoryToolId; name: string; summary: string; args: string; sensitive: boolean };
export const MEMORY_SERVER = "tokener-memory";
export const MEMORY_TOOLS: MemoryTool[] = [
  { id: "remember", name: "memory.remember", summary: "Store a fact, event or entity update in a layer.", args: "layer, text, entity?, tags?", sensitive: false },
  { id: "recall", name: "memory.recall", summary: "Find the items closest to a question, with scores.", args: "layer?, query, topK?", sensitive: false },
  { id: "update", name: "memory.update", summary: "Correct an item, keeping its history.", args: "id, text", sensitive: false },
  { id: "forget", name: "memory.forget", summary: "Delete an item. The deletion is audited.", args: "id", sensitive: true },
  { id: "list", name: "memory.list", summary: "List recent items in a layer.", args: "layer, limit?", sensitive: false },
  { id: "summarise", name: "memory.summarise", summary: "Fold the conversation so far into a short summary.", args: "session", sensitive: false },
];
export const ALL_MEMORY_TOOLS_ON: Record<MemoryToolId, boolean> = { remember: true, recall: true, update: true, forget: false, list: true, summarise: true };

export function layerFor(kind: MemoryKind, over: Partial<MemoryLayer> = {}): MemoryLayer {
  const k = KIND_BY_ID[kind];
  return {
    kind, enabled: true, backend: k.defaultBackend, scope: k.defaultScope, retentionDays: k.defaultRetention, maxItems: k.vector ? 50_000 : 5_000,
    write: kind === "procedural" ? "approval" : kind === "working" || kind === "conversation" ? "automatic" : "on-request", topK: 5, minScore: 0.35, strategy: k.vector ? "hybrid" : "recency",
    maskPersonalData: kind !== "working", embeddingModel: k.vector ? "text-embedding-3-small" : undefined, summariseAfterTurns: kind === "conversation" ? 12 : undefined, ...over,
  };
}

export function defaultMemory(namespace: string, kinds: MemoryKind[] = ["working", "conversation"]): MemoryConfig {
  return {
    layers: MEMORY_KINDS.map((k) => layerFor(k.id, { enabled: kinds.includes(k.id) })),
    tools: { ...ALL_MEMORY_TOOLS_ON }, namespace, region: "eu-west", customerKey: false,
  };
}

export const enabledLayers = (m: MemoryConfig | undefined) => (m ? m.layers.filter((l) => l.enabled) : []);
export const memoryOn = (m: MemoryConfig | undefined) => enabledLayers(m).length > 0;

export type MemoryIssue = { path: string; message: string; level: "error" | "warning" };

export function validateMemory(m: MemoryConfig): MemoryIssue[] {
  const out: MemoryIssue[] = [];
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(m.namespace)) out.push({ path: "namespace", level: "error", message: "Use 2 to 63 lowercase letters, digits and hyphens for the namespace." });
  const on = m.layers.filter((l) => l.enabled);
  for (const l of on) {
    const info = KIND_BY_ID[l.kind]; const be = BACKEND_BY_ID[l.backend]; const p = `layers.${l.kind}`;
    if (info.vector && !be.vector) out.push({ path: `${p}.backend`, level: "error", message: `${info.label} finds items by meaning, and ${be.label} cannot do that. Choose a vector store.` });
    if (!info.vector && !be.kv) out.push({ path: `${p}.backend`, level: "error", message: `${be.label} is a vector store only. ${info.label} needs a key and value store.` });
    if (l.backend !== "managed" && !l.connection) out.push({ path: `${p}.connection`, level: "error", message: `Choose the connection for ${be.label}. The credential stays in your secret manager.` });
    if (info.vector && !l.embeddingModel) out.push({ path: `${p}.embeddingModel`, level: "error", message: `${info.label} needs an embedding model.` });
    if (l.scope === "organisation" && !l.maskPersonalData) out.push({ path: `${p}.maskPersonalData`, level: "error", message: `${info.label} is readable across the organisation, so personal data must be masked before it is stored.` });
    if (l.scope === "run" && l.retentionDays !== null && l.retentionDays > 1) out.push({ path: `${p}.retentionDays`, level: "warning", message: "A run-scoped layer ends with the run. A longer retention has no effect." });
    if (l.retentionDays === null && l.scope === "user" && !l.maskPersonalData) out.push({ path: `${p}.retentionDays`, level: "warning", message: "Personal items kept for ever and not masked. Set a retention period or turn masking on." });
    if (l.topK < 1 || l.topK > 50) out.push({ path: `${p}.topK`, level: "error", message: "Return between 1 and 50 items." });
    if (l.minScore < 0 || l.minScore > 1) out.push({ path: `${p}.minScore`, level: "error", message: "The minimum score is between 0 and 1." });
    if (l.maxItems !== null && l.maxItems < 1) out.push({ path: `${p}.maxItems`, level: "error", message: "Allow at least one item, or leave it unlimited." });
    if (l.retentionDays !== null && l.retentionDays < 1) out.push({ path: `${p}.retentionDays`, level: "error", message: "Keep items for at least a day, or leave it unlimited." });
  }
  if (on.length && !Object.values(m.tools).some(Boolean)) out.push({ path: "tools", level: "warning", message: "No memory tool is on, so the agent cannot read or write the layers above." });
  if (!on.length && Object.values(m.tools).some(Boolean)) out.push({ path: "tools", level: "warning", message: "Memory tools are on but no layer is." });
  if (m.tools.forget && !on.length) out.push({ path: "tools.forget", level: "warning", message: "The forget tool has nothing to act on." });
  return out;
}

/** The tool grants an agent needs for its memory. The forget tool is sensitive, so it can be set to wait for a person. */
export function memoryGrants(m: MemoryConfig | undefined, approveForget = true): ToolGrant[] {
  if (!m || !memoryOn(m)) return [];
  return MEMORY_TOOLS.filter((t) => m.tools[t.id]).map((t) => ({ server: MEMORY_SERVER, tool: t.name.replace("memory.", ""), sensitive: t.sensitive, approval: t.sensitive && approveForget }));
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Items

export type MemoryItem = {
  id: string; kind: MemoryKind; text: string; entity?: string; tags: string[]; source: "agent" | "person" | "system"; createdAt: string; lastUsedAt: string | null; uses: number; pinned: boolean;
  /** The trace in which the agent wrote this item, when there is one. */
  traceId?: string;
};

const STOP = new Set(["the", "a", "an", "of", "to", "and", "or", "for", "in", "on", "is", "are", "was", "were", "it", "this", "that", "with", "at", "by", "as", "be", "from", "what", "which", "when", "how", "do", "does"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));

/**
 * A stand-in for the embedding search, used only in the sample workspace so recall can be tried without a model. It scores by shared words,
 * which is enough to show how topK, the minimum score and the recency blend change the result. The real service uses the layer's embedding model.
 */
export function recall(items: MemoryItem[], query: string, layer: Pick<MemoryLayer, "topK" | "minScore" | "strategy">, now = Date.now()): { item: MemoryItem; score: number }[] {
  const q = new Set(words(query));
  if (!q.size) return [];
  return items.map((item) => {
    const w = new Set(words(item.text + " " + (item.entity ?? "") + " " + item.tags.join(" ")));
    let hit = 0; q.forEach((x) => { if (w.has(x)) hit++; });
    const sim = hit / q.size;
    const ageDays = (now - Date.parse(item.createdAt)) / 86_400_000;
    const recency = Math.exp(-ageDays / 45);
    const score = layer.strategy === "similarity" ? sim : layer.strategy === "recency" ? recency * (hit ? 1 : 0) : sim * 0.8 + recency * 0.2 * (hit ? 1 : 0);
    return { item, score: Math.round(score * 100) / 100 };
  }).filter((x) => x.score >= layer.minScore && x.score > 0).sort((a, b) => b.score - a.score).slice(0, layer.topK);
}

/** Items beyond a layer's limit or older than its retention are removed. The sample store applies this when an item is added. */
export function applyRetention(items: MemoryItem[], layer: Pick<MemoryLayer, "retentionDays" | "maxItems">, now = Date.now()): MemoryItem[] {
  let out = items;
  if (layer.retentionDays !== null) out = out.filter((i) => i.pinned || now - Date.parse(i.lastUsedAt ?? i.createdAt) <= layer.retentionDays! * 86_400_000);
  if (layer.maxItems !== null && out.length > layer.maxItems) {
    const keep = [...out].sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.lastUsedAt ?? b.createdAt) - Date.parse(a.lastUsedAt ?? a.createdAt)).slice(0, layer.maxItems);
    const ids = new Set(keep.map((i) => i.id));
    out = out.filter((i) => ids.has(i.id));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Sample items

const DAYS = 86_400_000;
type Seed = [kind: MemoryKind, text: string, ageDays: number, extra?: { entity?: string; tags?: string[]; source?: MemoryItem["source"]; pinned?: boolean; uses?: number }];
const SAMPLE_ITEMS: Record<string, Seed[]> = {
  agt_01: [
    ["working", "Ticket 88121: customer wrote twice, same issue as ticket 88094.", 0, { tags: ["ticket"] }],
    ["conversation", "Summary: customer reports a duplicate charge on order 4411 and wants it reversed.", 0, { tags: ["billing"] }],
    ["conversation", "Customer prefers email over phone.", 1],
    ["episodic", "Refund for order 4410 was declined by a person because the item had been used.", 14, { tags: ["refund", "declined"], uses: 3 }],
    ["episodic", "A reply that quoted the policy clause was rated helpful by the customer.", 9, { tags: ["tone"], uses: 5 }],
    ["entity", "Acme Ltd: enterprise plan, billing contact is Ada, prefers invoices in euros.", 40, { entity: "Acme Ltd", tags: ["customer"], uses: 11 }],
    ["entity", "Globex: two open escalations, account manager is Grace.", 21, { entity: "Globex", tags: ["customer"], uses: 4 }],
  ],
  agt_02: [
    ["working", "Order 7012: wrong item sent, policy 4.2 applies.", 0],
    ["conversation", "Summary: refund for a late parcel, 42 dollars, policy 3.1.", 0],
    ["semantic", "Refunds above 500 dollars need a second approver.", 120, { tags: ["policy"], pinned: true, uses: 38 }],
    ["semantic", "Digital items cannot be refunded once downloaded, except for duplicate charges.", 120, { tags: ["policy", "digital"], pinned: true, uses: 17 }],
    ["semantic", "A request inside 30 days of delivery is eligible. One day outside goes to a person.", 120, { tags: ["policy", "window"], uses: 22 }],
    ["procedural", "When a refund is above 1,000 dollars, ask for a second approver before preparing the payout.", 60, { tags: ["approval"], source: "person", pinned: true, uses: 9 }],
    ["procedural", "Always state the policy clause that decided the case.", 60, { tags: ["tone"], source: "person", uses: 31 }],
  ],
  agt_03: [
    ["working", "Contract A-118: liability clause on page 14, renewal on page 3.", 0],
    ["semantic", "Unlimited liability, indemnity without a cap and consequential loss waivers are always unusual.", 200, { tags: ["clauses"], pinned: true, uses: 26 }],
    ["semantic", "Governing law in the EU region should be a member state, not an offshore jurisdiction.", 150, { tags: ["law"], uses: 8 }],
    ["semantic", "Auto-renewal with a notice period above 60 days is flagged.", 150, { tags: ["renewal"], uses: 12 }],
  ],
  agt_05: [
    ["working", "Invoice INV-9012 matched PO-5498 with a 4 percent price difference.", 0],
    ["entity", "Northwind: always invoices in batches of ten, tax is shown as a separate line.", 80, { entity: "Northwind", uses: 15 }],
    ["entity", "Contoso: unit prices change on the first of the month.", 52, { entity: "Contoso", uses: 6 }],
  ],
  agt_06: [
    ["working", "Brief for Initech: 2,400 staff, recently moved to a new CRM.", 0],
    ["semantic", "Initech announced a data platform migration in September.", 33, { tags: ["news"], uses: 2 }],
    ["semantic", "Our standard pitch for logistics buyers leads with delivery exceptions.", 90, { tags: ["pitch"], uses: 14 }],
    ["entity", "Initech: decision maker is the head of operations. Previous call went well.", 25, { entity: "Initech", uses: 3 }],
  ],
  agt_07: [
    ["conversation", "New starter asked where to request a laptop. Answered: through IT on day one.", 0],
    ["semantic", "Laptops are ordered through IT on the first day. Contractors use a loan device.", 180, { tags: ["handbook", "it"], uses: 44 }],
    ["semantic", "Annual leave is booked in the people portal and approved by the line manager.", 180, { tags: ["handbook", "leave"], uses: 51 }],
    ["semantic", "Expenses are claimed within 30 days with a receipt.", 180, { tags: ["handbook", "expenses"], uses: 19 }],
  ],
  agt_13: [
    ["working", "Competitor A lowered list price by 3 percent on Monday.", 0],
  ],
};

export function sampleMemoryItems(now = Date.now()): Record<string, MemoryItem[]> {
  const out: Record<string, MemoryItem[]> = {};
  for (const [agent, seeds] of Object.entries(SAMPLE_ITEMS)) {
    out[agent] = seeds.map(([kind, text, age, x], i) => ({
      id: `mem_${agent.slice(-2)}${(i + 1).toString().padStart(2, "0")}`, kind, text, entity: x?.entity, tags: x?.tags ?? [], source: x?.source ?? "agent",
      createdAt: new Date(now - age * DAYS - i * 3_600_000).toISOString(), lastUsedAt: x?.uses ? new Date(now - Math.min(age, 3) * DAYS).toISOString() : null, uses: x?.uses ?? 0, pinned: !!x?.pinned,
    }));
  }
  return out;
}
