/**
 * Writes the provider catalogue and the expected output of the console's credential checks for a fixed matrix of inputs, so the Java port can be
 * compared with it case by case (ProviderChecks). Run from tokener-ui: npx tsx scripts/export-provider-golden.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { dirname } from "node:path";
import { SPECS, validate } from "../src/lib/gateway/provider-catalog";

const out = "../tokener-provider/src/test/resources/io/tokener/provider/golden/providers.json";

const specs = SPECS.map((s) => ({
  id: s.id, name: s.name, kind: s.kind, glyph: s.glyph, blurb: s.blurb, auth: s.auth, baseUrl: s.baseUrl ?? null, regions: s.regions, probeModel: s.probeModel, keyHelp: s.keyHelp,
  discover: s.discover,
  fields: s.fields.map((f) => ({
    key: f.key, label: f.label, secret: !!f.secret, multiline: !!f.multiline, optional: !!f.optional, placeholder: f.placeholder ?? null, hint: f.hint ?? null, options: f.options ?? null,
    defaultValue: f.defaultValue ?? null, pattern: f.pattern ? f.pattern.source : null, patternFlags: f.pattern ? f.pattern.flags : null, patternHint: f.patternHint ?? null,
  })),
}));

const POOL = ["", "  ", "x", "sk-ant-abcdefghijklmnop", "sk-ant-short", "sk-abcdefghijklmnopqrst", "sk-proj-abcdefghijklmnopqrstuv", "AIzaAbCdEfGhIjKlMnOpQrStUvWxYz0123456789", "AIzaShort",
  "abcdefghijklmnopqrstuvwxyz012345", "abcdefghijklmnopqrstuvwx", "abc def ghijklmnopqrstuvwxyz012345", "https://example.com/v1", "https://example.com", "http://example.com", "http://localhost:11434/v1",
  "http://127.0.0.1:8000", "http://10.0.0.4/v1", "http://192.168.1.5:8080", "http://172.16.0.9", "http://172.32.0.9", "http://vllm:8000", "http://vllm/v1", "ftp://example.com", "https://",
  "https://my-resource.openai.azure.com", "https://my-resource.openai.azure.com/", "https://my-resource.cognitiveservices.azure.com", "https://MY-RESOURCE.OPENAI.AZURE.COM", "https://evil.example.com/openai.azure.com",
  "arn:aws:iam::123456789012:role/tokener-bedrock", "arn:aws-us-gov:iam::123456789012:role/path/to/role", "arn:aws:iam::12345:role/x", "arn:aws:s3:::bucket",
  '{"type":"service_account","project_id":"p"}', '{ "type" : "service_account" }', '{"type":"user"}', "not json",
  "my-project-123456", "Bad_Project", "ab-cd", "gpt-5-prod", "g", "gpt 5", "2025-04-01-preview", "2025-04-01", "2025-4-1", "us-east-1", "us-central1", "externalid-123", "short", "ext id with spaces",
  "llama-3-70b-instruct", "a".repeat(121), "é-café-sk", "\n", "key\n", " sk-ant-abcdefghijklmnop "];

const checks: { spec: string; field: string; value: string; errors: Record<string, string> }[] = [];
const baseValues: Record<string, Record<string, string>> = {
  anthropic: { "api-key": "sk-ant-abcdefghijklmnop" },
  openai: { "api-key": "sk-abcdefghijklmnopqrst" },
  "azure-openai": { endpoint: "https://my-resource.openai.azure.com", "api-key": "abcdefghijklmnopqrstuvwxyz012345", deployment: "gpt-5-prod", "api-version": "2025-04-01-preview" },
  bedrock: { role: "arn:aws:iam::123456789012:role/tokener-bedrock", "external-id": "externalid-123", "aws-region": "us-east-1" },
  vertex: { project: "my-project-123456", location: "us-central1", "service-account": '{"type":"service_account","project_id":"p"}' },
  gemini: { "api-key": "AIzaAbCdEfGhIjKlMnOpQrStUvWxYz0123456789" },
  mistral: { "api-key": "abcdefghijklmnopqrstuvwx" },
  compatible: { "base-url": "https://example.com/v1", model: "llama-3-70b-instruct" },
};
for (const s of SPECS) {
  const base = baseValues[s.id];
  checks.push({ spec: s.id, field: "", value: "", errors: validate(s, base) });
  checks.push({ spec: s.id, field: "*", value: "", errors: validate(s, {}) });
  for (const f of s.fields) for (const v of POOL) checks.push({ spec: s.id, field: f.key, value: v, errors: validate(s, { ...base, [f.key]: v }) });
}

/** The address check the console runs before any network call: plain http is allowed only for private and single label hosts. */
const plain = (url: string) => /^http:\/\//i.test(url) && !/^http:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[^/.]+(:|\/|$))/i.test(url);
const urls = POOL.filter((p) => /:/.test(p) || p === "").map((u) => ({ url: u, plainHttpToPublic: plain(u) }));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out + ".gz", gzipSync(JSON.stringify({ specs, baseValues, checks, urls }), { level: 9 }));
console.log(specs.length, "specs,", checks.length, "field checks,", urls.length, "addresses");
