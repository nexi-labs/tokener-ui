import { renderRequest, type Contract, type Scope } from "./contract";
import { AUTH_LABEL, type AuthMode, type Env, type IntegrationDef } from "./types";

/**
 * The code behind a connection, in the way people expect to see it next to a connector: the configuration as a resource, the REST calls that
 * create and test it, client calls in each SDK language, and for a contract connector the exact requests the platform will send.
 * Everything is built from the integration's definition and the values in the form, so it always matches what the screen will do.
 * Secrets appear only as references or as an environment variable placeholder. A real secret is never put in any snippet.
 */

export type CodeInput = {
  integration: IntegrationDef;
  name: string;
  env: Env;
  scope: string;
  owner: string;
  auth: AuthMode;
  secretRef?: string;
  endpoint: string;
  tlsVerify: boolean;
  permissions: "read-only" | "read-write";
  settings: Record<string, string | number | boolean>;
  /** Present once the connection exists. Before that, snippets show the id the server will return. */
  connectionId?: string;
};

export type CodeFile = { title: string; language: "json" | "yaml" | "bash" | "python" | "typescript" | "java" | "go" | "text"; code: string };
export type CodeTab = { id: string; label: string; note?: string; files: CodeFile[] };

const BASE = "https://api.tokener.io/api/v1/orgs/$TOKENER_ORG_ID/mlops";
const slug = (s: string) => (s || "connection").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "connection";

/** The body the API accepts. The same object is shown as JSON, as YAML and as the argument of each SDK call. */
export function connectionBody(i: CodeInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: i.name || "my-connection",
    integration: i.integration.id,
    environment: i.env,
    scope: i.scope,
    owner: i.owner,
    endpoint: i.endpoint || undefined,
    auth: i.auth === "none" ? { mode: "none" } : { mode: i.auth, ...(i.secretRef ? { secretRef: i.secretRef } : {}) },
    tls: { verify: i.tlsVerify },
    permissions: i.permissions,
  };
  const settings = Object.fromEntries(Object.entries(i.settings).filter(([k]) => k !== "endpoint"));
  if (Object.keys(settings).length) body.settings = settings;
  return JSON.parse(JSON.stringify(body));
}

export function toYaml(v: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  const scalar = (x: unknown): string => (typeof x === "string" ? (/^[A-Za-z0-9_./:@-]+$/.test(x) && !/^(true|false|null|yes|no|\d+)$/i.test(x) ? x : JSON.stringify(x)) : String(x));
  if (Array.isArray(v)) return v.map((x) => `${pad}- ${typeof x === "object" && x ? "\n" + toYaml(x, indent + 1) : scalar(x)}`).join("\n");
  if (v && typeof v === "object") return Object.entries(v as Record<string, unknown>).map(([k, x]) => (x && typeof x === "object" ? `${pad}${k}:\n${toYaml(x, indent + 1)}` : `${pad}${k}: ${scalar(x)}`)).join("\n");
  return pad + scalar(v);
}

const j = (v: unknown, n = 2) => JSON.stringify(v, null, n);
const indentBlock = (s: string, n: number) => s.split("\n").map((l, k) => (k === 0 ? l : " ".repeat(n) + l)).join("\n");

/** Placeholder values so a contract can be rendered before the person has chosen parameters. */
export function previewScope(i: CodeInput, params: Record<string, unknown> = {}): Scope {
  return { connection: { endpoint: i.endpoint || "https://example.invalid", env: i.env, options: i.settings }, params, capture: {} };
}

/** What tok∑ner will call, line by line, for a contract connector. The credential is added by the runtime and never appears here. */
export function contractCalls(i: CodeInput): CodeFile[] {
  const c: Contract | undefined = i.integration.contract;
  if (!c) return [];
  const scope = previewScope(i);
  const authLine = c.auth.mode === "none" ? "" : c.auth.mode === "header" ? `${c.auth.header}: ${c.auth.prefix ?? ""}<added by tok∑ner from ${i.secretRef ?? "the secret reference"}>` : c.auth.mode === "basic" ? "Authorization: Basic <added by tok∑ner from the secret reference>" : "Authorization: Bearer <added by tok∑ner from the secret reference>";
  const show = (req: ReturnType<typeof renderRequest>) => [`${req.method} ${req.url}`, ...(authLine ? [authLine] : []), ...Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`), ...(req.body ? ["", JSON.stringify(JSON.parse(req.body), null, 2)] : [])].join("\n");
  const files: CodeFile[] = [];
  files.push({ title: "Connection test", language: "text", code: c.test.map((t, n) => `# ${n + 1}. ${t.name}${t.requiresWrite ? " (read-write connections only)" : ""}${(t.scope ?? "connectivity") === "full" ? " (full test only)" : ""}\n${show(renderRequest(c, t.request, scope, true))}`).join("\n\n") });
  for (const d of c.discover ?? []) files.push({ title: `Discover ${d.kind}`, language: "text", code: show(renderRequest(c, d.request, scope, true)) });
  for (const [name, a] of Object.entries(c.actions ?? {})) {
    const p = Object.fromEntries((a.params ?? []).map((x) => [x.name, x.default ?? `<${x.name}>`]));
    const sc = previewScope(i, p);
    const plan = a.plan?.length ? `# Plan (nothing changes yet)\n${a.plan.map((s) => `- ${s.risk.toUpperCase()}: ${s.summary.replace(/\{\{\s*params\.(\w+)[^}]*\}\}/g, "<$1>")}`).join("\n")}\n\n` : "";
    files.push({ title: `Action ${name} (${a.mode})`, language: "text", code: plan + a.steps.map((s, n) => `# Step ${n + 1}: ${s.name}\n${show(renderRequest(c, s.request, { ...sc, capture: Object.fromEntries(Object.keys(s.capture ?? {}).map((k) => [k, `<${k}>`])) }, true))}`).join("\n\n") });
  }
  if (c.observe) files.push({ title: "Observe", language: "text", code: show(renderRequest(c, c.observe.request, scope, true)) });
  return files;
}

export function codeFor(i: CodeInput): CodeTab[] {
  const body = connectionBody(i);
  const id = i.connectionId ?? "$CONNECTION_ID";
  const resource = { apiVersion: "tokener.io/v1", kind: "Connection", metadata: { name: slug(i.name), environment: i.env }, spec: body };
  const tabs: CodeTab[] = [];

  tabs.push({
    id: "config", label: "Configuration",
    note: "The connection as a resource. Keep it in Git and apply it through the API, so changes are reviewed like code. The credential is a reference to your secret manager, never a value.",
    files: [{ title: "connection.json", language: "json", code: j(body) }, { title: "connection.yaml", language: "yaml", code: toYaml(resource) }],
  });

  const create = `curl -sS -X POST "${BASE}/connections" \\
  -H "Authorization: Bearer $TOKENER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '${j(body)}'`;
  const test = `curl -sS -X POST "${BASE}/connections/${id}:test" \\
  -H "Authorization: Bearer $TOKENER_API_KEY"`;
  const discover = i.integration.capabilities.some((c) => c.id === "discover" && c.level !== "none") ? `\n\ncurl -sS "${BASE}/connections/${id}/discover" \\\n  -H "Authorization: Bearer $TOKENER_API_KEY"` : "";
  tabs.push({
    id: "rest", label: "REST (curl)",
    note: "Needs an API key with the developer role for tests and the admin role to create. Set TOKENER_API_KEY and TOKENER_ORG_ID first. Repeating the create call with the same Idempotency-Key is safe.",
    files: [{ title: "Create", language: "bash", code: create }, { title: "Test", language: "bash", code: test + discover }],
  });

  const sdkBody = body;
  tabs.push({
    id: "python", label: "Python",
    files: [{ title: "pip install tokener", language: "python", code: `import os
from tokener import Tokener

client = Tokener(api_key=os.environ["TOKENER_API_KEY"], org_id=os.environ["TOKENER_ORG_ID"])

connection = client.mlops.create_connection(
    ${indentBlock(Object.entries(sdkBody).map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase())}=${pyValue(v)}`).join(",\n    "), 4)},
)

result = client.mlops.test_connection(connection.id)
print(result.status, result.failure_class, result.version)
` }],
  });
  tabs.push({
    id: "node", label: "Node.js",
    files: [{ title: "npm install @tokener/sdk", language: "typescript", code: `import { Tokener } from "@tokener/sdk";

const client = new Tokener({ apiKey: process.env.TOKENER_API_KEY!, orgId: process.env.TOKENER_ORG_ID! });

const connection = await client.mlops.createConnection(${indentBlock(j(sdkBody), 0)});

const result = await client.mlops.testConnection(connection.id);
console.log(result.status, result.failureClass, result.version);
` }],
  });
  tabs.push({
    id: "java", label: "Java",
    files: [{ title: "io.tokener:tokener-sdk", language: "java", code: `import io.tokener.Tokener;
import io.tokener.mlops.*;

var client = Tokener.builder().apiKey(System.getenv("TOKENER_API_KEY")).orgId(System.getenv("TOKENER_ORG_ID")).build();

var connection = client.mlops().createConnection(CreateConnection.builder()
    .name(${JSON.stringify(String(body.name))})
    .integration(${JSON.stringify(i.integration.id)})
    .environment(Environment.${i.env.toUpperCase()})
    .scope(${JSON.stringify(i.scope)})${i.endpoint ? `\n    .endpoint(${JSON.stringify(i.endpoint)})` : ""}
    .auth(${i.auth === "none" ? "Auth.none()" : `Auth.of(${JSON.stringify(i.auth)}${i.secretRef ? `, ${JSON.stringify(i.secretRef)}` : ""})`})
    .tlsVerify(${i.tlsVerify})
    .permissions(Permissions.${i.permissions === "read-only" ? "READ_ONLY" : "READ_WRITE"})
    .build());

var result = client.mlops().testConnection(connection.id());
System.out.println(result.status() + " " + result.failureClass() + " " + result.version());
` }],
  });
  tabs.push({
    id: "go", label: "Go",
    files: [{ title: "go get github.com/tokener/tokener-go", language: "go", code: `package main

import (
	"context"
	"fmt"
	"os"

	"github.com/tokener/tokener-go"
)

func main() {
	client := tokener.New(os.Getenv("TOKENER_API_KEY"), os.Getenv("TOKENER_ORG_ID"))
	ctx := context.Background()

	conn, err := client.MLOps.CreateConnection(ctx, tokener.CreateConnection{
		Name:        ${JSON.stringify(String(body.name))},
		Integration: ${JSON.stringify(i.integration.id)},
		Environment: ${JSON.stringify(i.env)},
		Scope:       ${JSON.stringify(i.scope)},${i.endpoint ? `\n\t\tEndpoint:    ${JSON.stringify(i.endpoint)},` : ""}
		Auth:        tokener.Auth{Mode: ${JSON.stringify(i.auth)}${i.secretRef ? `, SecretRef: ${JSON.stringify(i.secretRef)}` : ""}},
		TLSVerify:   ${i.tlsVerify},
		Permissions: ${JSON.stringify(i.permissions)},
	})
	if err != nil {
		panic(err)
	}
	res, err := client.MLOps.TestConnection(ctx, conn.ID)
	if err != nil {
		panic(err)
	}
	fmt.Println(res.Status, res.FailureClass, res.Version)
}
` }],
  });

  const calls = contractCalls(i);
  if (calls.length) tabs.push({
    id: "calls", label: "What tok∑ner will call",
    note: `Every request this connector can send, exactly as the contract defines it. ${AUTH_LABEL[i.auth]} credentials are added when the request is sent, from ${i.secretRef ?? "the secret reference"}. Values in <angle brackets> are filled in when an action runs.`,
    files: calls,
  });
  return tabs;
}

function pyValue(v: unknown, depth = 0): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "True" : "False";
  if (v === null || v === undefined) return "None";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return `[${v.map((x) => pyValue(x, depth + 1)).join(", ")}]`;
  return `{${Object.entries(v as Record<string, unknown>).map(([k, x]) => `${JSON.stringify(k)}: ${pyValue(x, depth + 1)}`).join(", ")}}`;
}
