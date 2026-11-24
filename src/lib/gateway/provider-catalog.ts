/**
 * Providers a customer can register with credentials they already own. Each entry says which credential the provider accepts, how it is checked
 * and what the gateway stores: only a `secretref://` reference, never the value. The checks here run in the browser against the shape of the
 * credential; a signed-in workspace sends the same request to the provider API, which makes the real call.
 *
 * Chat subscriptions (Claude Pro or Max, ChatGPT Plus or Pro) do not include API access and cannot be registered: providers issue API keys or
 * cloud credentials separately and bill them separately. The wizard says so.
 */
import { siOpenai, siAnthropic, siGooglegemini, siGooglecloud, siAmazonwebservices } from "simple-icons";
import type { Provider } from "@/lib/gateway/data";

export type CredField = {
  key: string; label: string; secret?: boolean; multiline?: boolean; optional?: boolean; placeholder?: string; hint?: string;
  options?: string[]; defaultValue?: string; pattern?: RegExp; patternHint?: string;
};

export type Glyph = "cloud" | "wind" | "plug" | "server";
export type ProviderSpec = {
  id: string; name: string; kind: string; icon: Provider["icon"]; glyph: Glyph; blurb: string; auth: string;
  fields: CredField[]; baseUrl?: string; regions: string[]; discover: { id: string; note: string }[]; probeModel: string;
  /** What a typical credential looks like, used for the format check. */
  keyHelp: string;
};

const REGIONS_US_EU = ["us-east", "us-central", "us-west", "eu-west", "eu-central", "ap-southeast"];

export const SPECS: ProviderSpec[] = [
  {
    id: "anthropic", name: "Anthropic", kind: "Claude", icon: siAnthropic, glyph: "cloud", auth: "API key", baseUrl: "https://api.anthropic.com", regions: ["us-east", "eu-west"], probeModel: "claude-sonnet-5-5",
    blurb: "Claude models through the Anthropic API, billed to your Anthropic organization.",
    keyHelp: "Create a key in the Anthropic Console under API keys. It begins with sk-ant-.",
    fields: [{ key: "api-key", label: "API key", secret: true, placeholder: "sk-ant-...", pattern: /^sk-ant-[A-Za-z0-9_-]{16,}$/, patternHint: "An Anthropic key begins with sk-ant- and has no spaces." }],
    discover: [{ id: "claude-opus-5-5", note: "Highest capability" }, { id: "claude-sonnet-5-5", note: "Balanced" }, { id: "claude-haiku-5-5", note: "Fast and low cost" }],
  },
  {
    id: "openai", name: "OpenAI", kind: "OpenAI", icon: siOpenai, glyph: "cloud", auth: "API key", baseUrl: "https://api.openai.com/v1", regions: ["us-east", "eu-west"], probeModel: "gpt-5-mini",
    blurb: "GPT and embedding models through the OpenAI API, billed to your OpenAI organization.",
    keyHelp: "Create a key on the OpenAI platform under API keys. Project keys begin with sk-proj-.",
    fields: [
      { key: "api-key", label: "API key", secret: true, placeholder: "sk-proj-...", pattern: /^sk-[A-Za-z0-9_-]{20,}$/, patternHint: "An OpenAI key begins with sk- and has no spaces." },
      { key: "organization", label: "Organization ID", optional: true, placeholder: "org-...", hint: "Only needed when the key belongs to more than one organization." },
      { key: "project", label: "Project ID", optional: true, placeholder: "proj_...", hint: "Pins usage and limits to one project." },
    ],
    discover: [{ id: "gpt-5", note: "General purpose" }, { id: "gpt-5-mini", note: "Lower cost" }, { id: "text-embedding-3-small", note: "Embeddings" }],
  },
  {
    id: "azure-openai", name: "Azure OpenAI", kind: "Azure OpenAI", icon: null, glyph: "cloud", auth: "Resource key", regions: ["us-east", "us-central", "eu-west", "eu-central"], probeModel: "gpt-5",
    blurb: "OpenAI models deployed in your own Azure subscription, so traffic stays inside your tenant and region.",
    keyHelp: "Open the Azure OpenAI resource, then Keys and Endpoint. Requests go to your deployment name, not the model name.",
    fields: [
      { key: "endpoint", label: "Resource endpoint", placeholder: "https://your-resource.openai.azure.com", pattern: /^https:\/\/[a-z0-9-]+\.(openai|cognitiveservices)\.azure\.com\/?$/i, patternHint: "Use the endpoint shown on the resource, for example https://your-resource.openai.azure.com." },
      { key: "api-key", label: "Resource key", secret: true, placeholder: "32 character key", pattern: /^[A-Za-z0-9]{32,}$/, patternHint: "An Azure key is 32 or more letters and digits." },
      { key: "deployment", label: "Deployment name", placeholder: "gpt-5-prod", pattern: /^[A-Za-z0-9._-]{2,64}$/, patternHint: "Letters, digits, dots, dashes and underscores." },
      { key: "api-version", label: "API version", defaultValue: "2025-04-01-preview", pattern: /^\d{4}-\d{2}-\d{2}(-preview)?$/, patternHint: "A date such as 2025-04-01-preview." },
    ],
    discover: [{ id: "gpt-5", note: "Deployment you named above" }],
  },
  {
    id: "bedrock", name: "Amazon Bedrock", kind: "Bedrock", icon: siAmazonwebservices, glyph: "cloud", auth: "IAM role", regions: ["us-east", "us-west", "eu-west", "eu-central", "ap-southeast"], probeModel: "claude-sonnet-5-5",
    blurb: "Claude, Llama, Mistral and others through your AWS account. Uses a role tok∑ner assumes, so no long-lived keys are shared.",
    keyHelp: "Create an IAM role that trusts the tok∑ner principal shown after you continue, with permission to invoke the models you want.",
    fields: [
      { key: "role", label: "Role ARN", placeholder: "arn:aws:iam::123456789012:role/tokener-bedrock", pattern: /^arn:aws[a-z-]*:iam::\d{12}:role\/[\w+=,.@\/-]+$/, patternHint: "An IAM role ARN such as arn:aws:iam::123456789012:role/name." },
      { key: "external-id", label: "External ID", secret: true, placeholder: "Shared secret for the trust policy", pattern: /^[\w+=,.@:\/-]{8,}$/, patternHint: "At least 8 characters. Put the same value in the role trust policy.", hint: "Stops another account from using your role by guessing its ARN." },
      { key: "aws-region", label: "AWS region", options: ["us-east-1", "us-west-2", "eu-west-1", "eu-central-1", "ap-southeast-2"], defaultValue: "us-east-1" },
    ],
    discover: [{ id: "claude-sonnet-5-5", note: "Anthropic on Bedrock" }, { id: "llama-3-70b", note: "Meta on Bedrock" }, { id: "mistral-large", note: "Mistral on Bedrock" }],
  },
  {
    id: "vertex", name: "Google Vertex AI", kind: "Vertex AI", icon: siGooglecloud, glyph: "cloud", auth: "Service account", regions: ["us-central", "us-east", "eu-west", "ap-southeast"], probeModel: "gemini-2-5-pro",
    blurb: "Gemini and partner models in your Google Cloud project, governed by your IAM and VPC settings.",
    keyHelp: "Create a service account with the Vertex AI User role, then download a JSON key. The whole file is stored as one secret.",
    fields: [
      { key: "project", label: "Project ID", placeholder: "my-project-123456", pattern: /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/, patternHint: "Lowercase letters, digits and dashes, 6 to 30 characters." },
      { key: "location", label: "Location", options: ["us-central1", "us-east5", "europe-west4", "asia-southeast1"], defaultValue: "us-central1" },
      { key: "service-account", label: "Service account JSON", secret: true, multiline: true, placeholder: '{ "type": "service_account", "project_id": "...", ... }', pattern: /"type"\s*:\s*"service_account"/, patternHint: 'Paste the full JSON key file. It must contain "type": "service_account".' },
    ],
    discover: [{ id: "gemini-2-5-pro", note: "Long context" }, { id: "gemini-2-5-flash", note: "Low latency" }],
  },
  {
    id: "gemini", name: "Google Gemini API", kind: "Gemini", icon: siGooglegemini, glyph: "cloud", auth: "API key", baseUrl: "https://generativelanguage.googleapis.com", regions: ["us-central"], probeModel: "gemini-2-5-flash",
    blurb: "Gemini through Google AI Studio keys, for teams that are not on Google Cloud.",
    keyHelp: "Create a key in Google AI Studio. It begins with AIza.",
    fields: [{ key: "api-key", label: "API key", secret: true, placeholder: "AIza...", pattern: /^AIza[A-Za-z0-9_-]{30,}$/, patternHint: "A Gemini key begins with AIza and has no spaces." }],
    discover: [{ id: "gemini-2-5-pro", note: "Long context" }, { id: "gemini-2-5-flash", note: "Low latency" }],
  },
  {
    id: "mistral", name: "Mistral", kind: "Mistral", icon: null, glyph: "wind", auth: "API key", baseUrl: "https://api.mistral.ai/v1", regions: ["eu-west"], probeModel: "mistral-small",
    blurb: "Mistral models from La Plateforme, hosted in the EU.",
    keyHelp: "Create a key in the Mistral console under API keys.",
    fields: [{ key: "api-key", label: "API key", secret: true, placeholder: "32 character key", pattern: /^[A-Za-z0-9]{24,}$/, patternHint: "A Mistral key is 24 or more letters and digits." }],
    discover: [{ id: "mistral-large", note: "Highest capability" }, { id: "mistral-small", note: "Lower cost" }],
  },
  {
    id: "compatible", name: "OpenAI-compatible endpoint", kind: "OpenAI-compatible", icon: null, glyph: "plug", auth: "Base URL and key", regions: REGIONS_US_EU, probeModel: "",
    blurb: "Anything that speaks the OpenAI chat API: Groq, Together, DeepSeek, xAI, OpenRouter, Perplexity, vLLM, Ollama, LiteLLM or your own gateway.",
    keyHelp: "Use the base URL your vendor documents, ending in /v1 for most. Leave the key empty for an endpoint that has no authentication on a private network.",
    fields: [
      { key: "base-url", label: "Base URL", placeholder: "https://api.example.com/v1", pattern: /^https?:\/\/[^\s/]+(\/\S*)?$/, patternHint: "A full URL beginning with https://. Plain http is accepted only for private addresses." },
      { key: "api-key", label: "API key", secret: true, optional: true, placeholder: "Bearer token", hint: "Sent as an Authorization bearer header." },
      { key: "model", label: "Model to probe", placeholder: "llama-3-70b-instruct", pattern: /^\S{1,120}$/, patternHint: "Any model name the endpoint serves." },
    ],
    discover: [],
  },
];

export const specById = (id: string) => SPECS.find((s) => s.id === id);

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "provider";

/** The reference stored in place of each secret value. */
export function secretRefFor(spec: ProviderSpec, providerId: string, fieldKey: string) {
  return `secretref://vault/prod/providers/${providerId}/${fieldKey}`;
}

export type FieldError = Record<string, string>;
export function validate(spec: ProviderSpec, values: Record<string, string>): FieldError {
  const err: FieldError = {};
  for (const f of spec.fields) {
    const v = (values[f.key] ?? "").trim();
    if (!v) { if (!f.optional) err[f.key] = "Required."; continue; }
    if (f.pattern && !f.pattern.test(v)) err[f.key] = f.patternHint ?? "Not in the expected format.";
  }
  return err;
}

export type CheckStep = { id: "reach" | "auth" | "models" | "completion"; label: string; ok: boolean; ms: number; detail: string };
/** `verified` is false when the control plane has no way to check this provider yet (the steps then say so). Sample results leave it unset. */
export type TestOutcome = { ok: boolean; steps: CheckStep[]; models: { id: string; note: string }[]; ranAt: string; verified?: boolean };

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/**
 * A sample check that mirrors the four things a real test does: reach the endpoint, authenticate, list models, run one tiny completion. It judges
 * the credential only by its format and a few obvious mistakes, and its timings are derived from the input so the same input gives the same
 * result. It never sends anything. A signed-in workspace calls `POST /api/v1/providers/test` instead.
 */
export function sampleTest(spec: ProviderSpec, values: Record<string, string>): TestOutcome {
  const errs = validate(spec, values);
  const seed = hash(spec.id + JSON.stringify(Object.keys(values)));
  const ms = (base: number) => base + (seed % 41);
  const steps: CheckStep[] = [];
  const url = values["base-url"] || values["endpoint"] || spec.baseUrl || "";
  const plainHttp = /^http:\/\//i.test(url) && !/^http:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[^/.]+(:|\/|$))/i.test(url);
  const urlBad = !!errs["base-url"] || !!errs["endpoint"] || plainHttp;
  const reach: CheckStep = { id: "reach", label: "Reach the endpoint", ok: !urlBad, ms: ms(38), detail: urlBad ? (plainHttp ? "Plain http to a public address is refused. Use https." : "The address is not a valid URL.") : `TLS handshake with ${url ? new URL(url.startsWith("http") ? url : `https://${url}`).host : "provider endpoint"} completed.` };
  steps.push(reach);
  const credBad = Object.keys(errs).some((k) => k !== "base-url" && k !== "endpoint");
  const auth: CheckStep = { id: "auth", label: "Authenticate", ok: reach.ok && !credBad, ms: ms(64), detail: !reach.ok ? "Skipped because the endpoint was not reachable." : credBad ? `Rejected. ${Object.values(errs).find(Boolean)}` : spec.id === "bedrock" ? "Role assumed with the external ID." : spec.id === "vertex" ? "Service account token issued." : "Credential accepted." };
  steps.push(auth);
  const models = auth.ok ? (spec.discover.length ? spec.discover : values["model"] ? [{ id: values["model"].trim(), note: "Model you entered" }] : []) : [];
  steps.push({ id: "models", label: "List models", ok: auth.ok && models.length > 0, ms: ms(92), detail: !auth.ok ? "Skipped." : models.length ? `${models.length} model${models.length === 1 ? "" : "s"} available to this credential.` : "The endpoint listed no models." });
  const probe = models[0]?.id ?? spec.probeModel;
  steps.push({ id: "completion", label: "Run one test completion", ok: auth.ok && models.length > 0, ms: ms(310), detail: auth.ok && models.length ? `${probe} answered a 1 token request.` : "Skipped." });
  return { ok: steps.every((s) => s.ok), steps, models, ranAt: new Date().toLocaleTimeString("en-GB") };
}

/** A canned reply for the playground, clearly a stand-in for the model's answer. */
export function sampleReply(model: string, prompt: string) {
  const words = prompt.trim().split(/\s+/).filter(Boolean).length;
  return { text: `This is a stand-in reply. In a signed-in workspace the gateway forwards your ${words} word prompt to ${model} with your credential and shows the real answer here, with its token counts, cost and latency.`, tokensIn: Math.max(4, Math.round(words * 1.35)), tokensOut: 41, ms: 240 + (hash(model + prompt) % 380) };
}

/* ---- Registered providers kept for this browser session (sample workspace). Only non-secret metadata is stored. ---- */
const KEY = "tok.providers.registered";
export type Registered = Provider & { fresh: true; specId: string; secretRefs: string[] };

export function readRegistered(): Registered[] {
  try { const r = sessionStorage.getItem(KEY); return r ? (JSON.parse(r) as Registered[]) : []; } catch { return []; }
}
export function saveRegistered(p: Registered) {
  try { const slim = { ...p, icon: p.icon ? { title: p.icon.title, path: p.icon.path, hex: p.icon.hex } : null }; sessionStorage.setItem(KEY, JSON.stringify([...readRegistered().filter((x) => x.id !== p.id), slim])); window.dispatchEvent(new Event("tok-providers")); } catch { /* storage unavailable, the provider is simply not remembered */ }
}
