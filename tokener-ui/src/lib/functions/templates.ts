import type { DataClass, Governance, Runtime, TriggerKind } from "./types";

export type FnTemplate = {
  id: string; label: string; summary: string; useCase: string; runtime: Runtime; description: string; tags: string[];
  triggers: TriggerKind[]; models: string[]; dataClass: DataClass; maxCostMicros: number; maxInput: number; maxOutput: number; timeoutS: number;
};

export const FN_TEMPLATES: FnTemplate[] = [
  { id: "blank", label: "Blank function", summary: "Start from an empty handler and set everything yourself.", useCase: "", runtime: "python3.12", description: "", tags: [], triggers: ["http"], models: [], dataClass: "internal", maxCostMicros: 5_000, maxInput: 2000, maxOutput: 500, timeoutS: 15 },
  { id: "fraud", label: "Fraud scoring", summary: "Score events from a Kafka topic on an in-house model. Card data stays inside.", useCase: "Fraud detection", runtime: "python3.12", description: "Scores an authorised payment and returns a risk score with reasons.", tags: ["fraud", "realtime"], triggers: ["kafka", "http"], models: ["llama-3.3-70b"], dataClass: "restricted", maxCostMicros: 20_000, maxInput: 700, maxOutput: 120, timeoutS: 8 },
  { id: "docs", label: "Document extraction", summary: "Pull typed fields from uploaded documents, then hand off to a human approval workflow.", useCase: "Document processing", runtime: "python3.12", description: "Extracts fields from application documents with a confidence per field.", tags: ["documents", "extraction"], triggers: ["http"], models: ["claude-sonnet"], dataClass: "restricted", maxCostMicros: 60_000, maxInput: 4200, maxOutput: 1000, timeoutS: 45 },
  { id: "tickets", label: "Ticket classification", summary: "Classify tickets from a Kafka topic with a small, fast model.", useCase: "Support triage", runtime: "node22", description: "Classifies a ticket by topic, priority and sentiment.", tags: ["support", "classification"], triggers: ["kafka", "http"], models: ["claude-haiku"], dataClass: "confidential", maxCostMicros: 4_000, maxInput: 600, maxOutput: 80, timeoutS: 8 },
  { id: "digest", label: "Scheduled cost digest", summary: "Run every morning, read usage, write a short digest.", useCase: "AI cost analysis", runtime: "python3.12", description: "Summarises yesterday's AI usage and the biggest movers.", tags: ["finops", "scheduled"], triggers: ["schedule"], models: ["claude-haiku"], dataClass: "internal", maxCostMicros: 30_000, maxInput: 5000, maxOutput: 800, timeoutS: 60 },
  { id: "local", label: "Local model inference", summary: "Call a model served by vLLM or Ollama inside your network, with no egress.", useCase: "Local inference", runtime: "go1.23", description: "Summarises text on an in-house model so it never leaves the network.", tags: ["local-model", "no-egress"], triggers: ["http"], models: ["llama-3.3-70b", "qwen2.5-14b"], dataClass: "restricted", maxCostMicros: 5_000, maxInput: 1900, maxOutput: 350, timeoutS: 30 },
];

export const SAMPLE_CODE: Record<Runtime, string> = {
  "python3.12": `def handler(event, context):
    """event["input"] is the validated request body.
    Model calls go through the tokener gateway client, which applies policy and records usage."""
    text = event["input"]["text"]
    result = context.ai.complete(
        model="claude-haiku",
        prompt=f"Summarise in two sentences:\\n{text}",
        max_output_tokens=200,
    )
    return {"summary": result.text}
`,
  node22: `export async function handler(event, context) {
  // event.input is the validated request body.
  const { text } = event.input;
  const result = await context.ai.complete({
    model: "claude-haiku",
    prompt: \`Summarise in two sentences:\\n\${text}\`,
    maxOutputTokens: 200,
  });
  return { summary: result.text };
}
`,
  java21: `public final class Handler {
    public Output handle(Input input, Context context) {
        var result = context.ai().complete(Request.of("claude-haiku",
            "Summarise in two sentences:\\n" + input.text(), 200));
        return new Output(result.text());
    }
    public record Input(String text) {}
    public record Output(String summary) {}
}
`,
  "go1.23": `func Handle(ctx context.Context, in Input, c *tokener.Client) (Output, error) {
    res, err := c.AI.Complete(ctx, tokener.Request{
        Model:           "llama-3.3-70b",
        Prompt:          "Summarise in two sentences:\\n" + in.Text,
        MaxOutputTokens: 200,
    })
    if err != nil {
        return Output{}, err
    }
    return Output{Summary: res.Text}, nil
}
`,
  container: `# Your image must serve POST /invoke on port 8080.
# tok∑ner injects the correlation id as X-Correlation-Id and a short-lived gateway token as TOKENER_GATEWAY_TOKEN.
FROM registry.nexi.example/base/python:3.12-slim@sha256:0f2c...
COPY app /app
CMD ["python", "/app/server.py"]
`,
};

export const ALLOWED_REGISTRIES = ["registry.nexi.example"];

/** Checks a container image reference the way the platform will: an allowed registry and a pinned digest. */
export function checkImage(ref: string): string | null {
  if (!ref.trim()) return "Enter an image reference.";
  const host = ref.split("/")[0];
  if (!ALLOWED_REGISTRIES.includes(host)) return `The registry ${host} is not on the allowed list (${ALLOWED_REGISTRIES.join(", ")}).`;
  if (!/@sha256:[a-f0-9]{64}$/.test(ref)) return "Pin the image by digest, for example registry.nexi.example/team/app@sha256:<64 hex characters>. Tags can move.";
  return null;
}

export function defaultGovernance(t: FnTemplate, providersOf: (modelId: string) => string): Governance {
  const prov = [...new Set(t.models.map(providersOf))].filter(Boolean);
  return {
    allowedProviders: prov, allowedModels: t.models, maxInputTokens: t.maxInput, maxOutputTokens: t.maxOutput, maxCostMicros: t.maxCostMicros, dailyBudgetMicros: t.maxCostMicros * 400, weeklyBudgetMicros: t.maxCostMicros * 2000,
    invocationsPerMinute: 120, dailyInvocationCap: 5000, maxConcurrency: 10, timeoutS: t.timeoutS, retries: { max: 1, backoff: "exponential", initialMs: 250 }, deadLetter: null, egress: "none", egressAllow: [], secretRefs: [],
    dataClass: t.dataClass, piiRedaction: t.dataClass !== "public", logPayloads: t.dataClass === "restricted" ? "none" : "redacted", approvalAboveMicros: null, policyIds: ["pol-models", "pol-budget", "pol-egress"], tools: [],
  };
}
