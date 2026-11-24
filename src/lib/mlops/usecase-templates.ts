import { USE_CASE_CATALOG } from "@/lib/usecases/catalog";
import { INDUSTRY_LABELS, INDUSTRY_ORDER } from "@/lib/usecases/labels";
import { PIPELINES } from "@/lib/usecases/pipelines";
import { OP_BY_KIND, defaultConfig } from "./operators";
import { autoConnect, connectPorts, newSpec, type PipelineSpec } from "./spec";
import type { Template } from "./templates";

/**
 * An approval always goes to the target's gate input, and content goes to a message or context input before any gate,
 * so a model's reply is never wired in as a trigger by accident. Anything else falls back to the first valid port pair.
 */
function connectPreferred(spec: PipelineSpec, from: string, to: string) {
  const a = spec.nodes.find((n) => n.id === from)!, b = spec.nodes.find((n) => n.id === to)!;
  const A = OP_BY_KIND[a.operator], B = OP_BY_KIND[b.operator];
  const prefer = a.operator === "approval_gate" ? ["gate"] : ["context", "message", "documents"];
  for (const want of prefer) {
    const input = B.inputs.find((p) => p.id === want);
    if (!input) continue;
    for (const o of A.outputs) {
      const r = connectPorts(spec, from, o.id, to, input.id);
      if (!r.error) return r;
    }
  }
  return autoConnect(spec, from, to);
}

const snake = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/**
 * Defaults taken from the step's own name, so an example reads as the story it tells: a tool step named "Update the claim"
 * calls `update_the_claim`, a notify step named "Tell collections" posts to `#tell-collections`. Explicit config wins.
 */
function fromName(kind: string, name: string): Record<string, unknown> {
  switch (kind) {
    case "mcp_tool": return { tool: snake(name) };
    case "mcp_resource": return { uri: `mcp://${snake(name)}` };
    case "notify": return { channel: `#${snake(name).replace(/_/g, "-")}` };
    case "llm_step": return { prompt: `${name}.` };
    case "pay_mtn_momo": case "pay_orange_money": case "pay_paypal": case "pay_card": case "pay_bitcoin": case "pay_custom":
      return { amountSource: "From order data" };
    default: return {};
  }
}

/** Build the example pipeline behind a use case article. Throws if a link cannot be made, so a bad sketch fails loudly in tests. */
export function buildUseCaseSpec(slug: string): PipelineSpec {
  const sketch = PIPELINES[slug];
  if (!sketch) throw new Error(`No pipeline for use case ${slug}`);
  let spec = newSpec(slug, "staging", "you@example.com");
  const ids: string[] = [];
  sketch.nodes.forEach(([kind, name, config], i) => {
    const op = OP_BY_KIND[kind];
    if (!op) throw new Error(`Unknown operator ${kind} in ${slug}`);
    const id = `${kind.replace(/_/g, "-")}-${i + 1}`;
    ids.push(id);
    spec = { ...spec, nodes: [...spec.nodes, { id, operator: kind, schemaVersion: op.schemaVersion, name, x: 0, y: 0, config: { ...defaultConfig(kind), ...fromName(kind, name), ...(config ?? {}) } }] };
  });
  for (const [a, b] of sketch.links) {
    const r = connectPreferred(spec, ids[a], ids[b]);
    if (r.error) throw new Error(`${slug}: ${sketch.nodes[a][1]} to ${sketch.nodes[b][1]}: ${r.error}`);
    spec = r.spec;
  }
  return spec;
}

/** Templates for the use cases that ship with a pipeline, ordered by industry. Template ids are `uc-<slug>`. */
export const USE_CASE_TEMPLATES: (Template & { industry: string })[] = USE_CASE_CATALOG
  .filter((u) => u.hasPipeline)
  .sort((a, b) => INDUSTRY_ORDER.indexOf(a.industry) - INDUSTRY_ORDER.indexOf(b.industry))
  .map((u) => ({
    id: `uc-${u.slug}`,
    industry: u.industry,
    title: u.title,
    summary: u.summary,
    story: `The example pipeline behind the ${INDUSTRY_LABELS[u.industry] ?? u.industry} use case. Read the article at /use-cases/${u.slug}.`,
    tags: [INDUSTRY_LABELS[u.industry] ?? u.industry, ...u.tags],
    defaultEnv: "staging" as const,
    build: () => buildUseCaseSpec(u.slug),
  }));
