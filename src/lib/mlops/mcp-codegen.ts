import { isSingleSelect, sqlParams, type McpField, type McpServerSpec, type McpTool } from "./mcp-model";

/**
 * Starter projects for self-hosting a custom MCP server. The output is a working server for the official SDKs
 * (TypeScript @modelcontextprotocol/sdk 1.x, Python mcp 2.x) with one tool per tool in the builder. Nothing secret is written:
 * credentials are read from environment variables whose names are listed in .env.example. Tools that change data call a
 * pipeline, so the approval gate and the audit record stay in tok∑ner.
 */
export type GeneratedFile = { path: string; content: string };

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
const q = (s: string) => JSON.stringify(s);
const envName = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "_");

/** Splits a URL template on {{name}} and returns the pieces so each generator can build its own string expression. */
function parts(template: string): ({ lit: string } | { arg: string })[] {
  const out: ({ lit: string } | { arg: string })[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)) {
    if (m.index! > last) out.push({ lit: template.slice(last, m.index) });
    out.push({ arg: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < template.length) out.push({ lit: template.slice(last) });
  return out;
}

/** :name placeholders become $1, $2 (Postgres) or %s (psycopg). Returns the SQL and the field names in the order they are bound. */
function positional(query: string, style: "dollar" | "percent"): { sql: string; order: string[] } {
  const order: string[] = [];
  const sql = query.trim().replace(/;\s*$/, "").split(/('(?:[^']|'')*')/).map((chunk, i) => {
    if (i % 2 === 1) return chunk;
    return chunk.replace(/(^|[^:]):([a-zA-Z_][a-zA-Z0-9_]*)/g, (_m, pre: string, name: string) => {
      // Postgres numbered parameters can be reused; psycopg's %s cannot, so each use binds again.
      if (style === "dollar" && order.includes(name)) return `${pre}$${order.indexOf(name) + 1}`;
      order.push(name);
      return pre + (style === "dollar" ? `$${order.length}` : "%s");
    });
  }).join("");
  return { sql: style === "percent" ? sql.replace(/%(?!s)/g, "%%") : sql, order };
}

// ------------------------------------------------------------------------------------------------ TypeScript

const zodType = (f: McpField) => {
  let z = f.type === "string" ? (f.options?.length ? `z.enum([${f.options.map(q).join(", ")}])` : "z.string()") : f.type === "integer" ? "z.number().int()" : f.type === "number" ? "z.number()" : "z.boolean()";
  if (f.description) z += `.describe(${q(f.description)})`;
  if (!f.required) z += ".optional()";
  return z;
};

function tsHandler(t: McpTool): string {
  const s = t.source;
  if (s.kind === "http") {
    const url = parts(s.url).map((p) => ("lit" in p ? esc(p.lit) : `\${encodeURIComponent(String(args.${p.arg}))}`)).join("");
    const secret = s.secretName ? `
      const secret = process.env.${s.secretName};
      if (!secret) return fail("The server is missing its credential (${s.secretName}).");
      headers.authorization = \`Bearer \${secret}\`;` : "";
    return `async (args) => {
      const headers: Record<string, string> = { accept: "application/json" };${secret}
      const init: RequestInit = { method: ${q(s.method)}, headers, redirect: "error", signal: AbortSignal.timeout(15_000) };${s.method === "POST" ? `
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(args);` : ""}
      try {
        const res = await fetch(\`${url}\`, init);
        if (!res.ok) return fail(\`The service answered \${res.status}.\`);
        return text(await res.text());
      } catch { return fail("The service could not be reached."); }
    }`;
  }
  if (s.kind === "sql") {
    const { sql, order } = positional(s.query, "dollar");
    return `async (args) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN READ ONLY");
        const r = await client.query(${q(sql)}, [${order.map((n) => `args.${n} ?? null`).join(", ")}]);
        await client.query("COMMIT");
        return text(JSON.stringify(r.rows.slice(0, 200)));
      } catch { await client.query("ROLLBACK").catch(() => undefined); return fail("The query failed."); }
      finally { client.release(); }
    }`;
  }
  if (s.kind === "model") {
    return `async (args) => {
      const res = await fetch(\`\${process.env.TOKENER_GATEWAY_URL}/v1/chat/completions\`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(60_000),
        headers: { "content-type": "application/json", authorization: \`Bearer \${process.env.TOKENER_API_KEY}\` },
        body: JSON.stringify({ model: ${q(s.alias)}, messages: [{ role: "system", content: ${q(s.instruction)} }, { role: "user", content: JSON.stringify(args) }] }),
      });
      if (!res.ok) return fail(\`The gateway answered \${res.status}.\`);
      const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return text(j.choices?.[0]?.message?.content ?? "");
    }`;
  }
  return `async (args) => {
      const base = \`\${process.env.TOKENER_API_URL}/api/v1/orgs/\${process.env.TOKENER_ORG_ID}/mlops\`;
      const headers = { "content-type": "application/json", authorization: \`Bearer \${process.env.TOKENER_API_KEY}\` };
      const start = await fetch(\`\${base}/pipelines/${esc(s.pipelineId)}/runs\`, { method: "POST", headers: { ...headers, "idempotency-key": randomUUID() }, body: JSON.stringify({ mode: "real", input: args }), signal: AbortSignal.timeout(15_000) });
      if (!start.ok) return fail(\`The pipeline did not start (\${start.status}).\`);
      const run = (await start.json()) as { id: string };
      const until = Date.now() + ${s.waitSeconds * 1000};
      const done = ["succeeded", "failed", "validation-failed", "cancelled", "rolled-back"];
      while (Date.now() < until) {
        const r = await fetch(\`\${base}/runs/\${run.id}\`, { headers, signal: AbortSignal.timeout(15_000) });
        if (r.ok) {
          const body = (await r.json()) as { status: string };
          if (done.includes(body.status)) return text(JSON.stringify({ runId: run.id, status: body.status }));
        }
        await new Promise((ok) => setTimeout(ok, 2000));
      }
      return text(JSON.stringify({ runId: run.id, status: "still running or waiting for approval" }));
    }`;
}

export function generateTypeScript(spec: McpServerSpec): GeneratedFile[] {
  const usesSql = spec.tools.some((t) => t.source.kind === "sql");
  const usesPipeline = spec.tools.some((t) => t.source.kind === "pipeline");
  const tools = spec.tools.map((t) => {
    const shape = t.fields.map((f) => `        ${f.name}: ${zodType(f)},`).join("\n");
    return `  server.registerTool(
    ${q(t.name)},
    {
      description: ${q(t.description)},
      inputSchema: {
${shape}
      },
      annotations: { readOnlyHint: ${t.effect === "reads"}, destructiveHint: ${t.effect === "changes"}, idempotentHint: false, openWorldHint: ${t.source.kind === "http"} },
    },
    ${tsHandler(t)},
  );`;
  }).join("\n\n");

  const auth = spec.auth === "oauth" ? `
const jwks = createRemoteJWKSet(new URL(must("MCP_JWKS_URL")));
async function authorised(req: express.Request): Promise<boolean> {
  const token = /^Bearer (.+)$/i.exec(req.headers.authorization ?? "")?.[1];
  if (!token) return false;
  try { await jwtVerify(token, jwks, { issuer: must("MCP_ISSUER"), audience: must("MCP_AUDIENCE") }); return true; } catch { return false; }
}` : spec.auth === "api-key" ? `
const apiKey = Buffer.from(must("MCP_API_KEY"));
async function authorised(req: express.Request): Promise<boolean> {
  const given = Buffer.from(/^Bearer (.+)$/i.exec(req.headers.authorization ?? "")?.[1] ?? "");
  return given.length === apiKey.length && timingSafeEqual(given, apiKey);
}` : `
// ${spec.auth === "mtls" ? "Mutual TLS is terminated by your ingress or proxy. This server listens on the loopback address only, so only that proxy can reach it." : "No authentication. Development only."}
async function authorised(_req: express.Request): Promise<boolean> { return true; }`;

  const server = `${[usesPipeline ? "randomUUID" : "", spec.auth === "api-key" ? "timingSafeEqual" : ""].filter(Boolean).length ? `import { ${[usesPipeline ? "randomUUID" : "", spec.auth === "api-key" ? "timingSafeEqual" : ""].filter(Boolean).join(", ")} } from "node:crypto";\n` : ""}import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";${spec.auth === "oauth" ? `\nimport { createRemoteJWKSet, jwtVerify } from "jose";` : ""}${usesSql ? `\nimport pg from "pg";` : ""}

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(\`Set \${name}. See .env.example.\`);
  return v;
}
${usesSql ? `\nconst pool = new pg.Pool({ connectionString: must("DATABASE_URL"), max: 4, statement_timeout: 10_000 });\n` : ""}const MAX = 20_000;
const text = (s: string) => ({ content: [{ type: "text" as const, text: s.length > MAX ? \`\${s.slice(0, MAX)}\\n[truncated]\` : s }] });
const fail = (s: string) => ({ isError: true, content: [{ type: "text" as const, text: s }] });
${auth}

function createServer(): McpServer {
  const server = new McpServer({ name: ${q(spec.slug)}, version: ${q(`1.${spec.version}.0`)} });

${tools}

  return server;
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.post("/mcp", async (req, res) => {
  if (!(await authorised(req))) { res.status(401).set("WWW-Authenticate", "Bearer").json({ error: "unauthorised" }); return; }
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { void transport.close(); void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
app.get("/mcp", (_req, res) => { res.status(405).set("Allow", "POST").end(); });

const port = Number(process.env.PORT ?? 3000);
app.listen(port, ${spec.auth === "mtls" ? `"127.0.0.1", ` : ""}() => console.log(\`${spec.slug} listening on :\${port}/mcp\`));
`;

  const env = [
    spec.auth === "api-key" ? "MCP_API_KEY=" : spec.auth === "oauth" ? "MCP_JWKS_URL=\nMCP_ISSUER=\nMCP_AUDIENCE=" : "",
    ...Array.from(new Set(spec.tools.flatMap((t) => (t.source.kind === "http" && t.source.secretName ? [`${t.source.secretName}=`] : [])))),
    usesSql ? "DATABASE_URL=" : "",
    spec.tools.some((t) => t.source.kind === "model") ? "TOKENER_GATEWAY_URL=https://gateway.example.tokener.io\nTOKENER_API_KEY=" : "",
    usesPipeline ? "TOKENER_API_URL=https://api.example.tokener.io\nTOKENER_ORG_ID=\nTOKENER_API_KEY=" : "",
    "PORT=3000",
  ].filter(Boolean).join("\n").split("\n").filter((l, i, a) => a.indexOf(l) === i).join("\n") + "\n";

  const deps: Record<string, string> = { "@modelcontextprotocol/sdk": "^1.32.1", express: "^4.21.2", zod: "^3.25.76" };
  const dev: Record<string, string> = { typescript: "^5.6.3", "@types/node": "^22.10.0", "@types/express": "^4.17.21", tsx: "^4.19.2" };
  if (spec.auth === "oauth") deps.jose = "^5.9.6";
  if (usesSql) { deps.pg = "^8.13.1"; dev["@types/pg"] = "^8.11.10"; }

  return [
    { path: "src/server.ts", content: server },
    { path: "package.json", content: JSON.stringify({ name: spec.slug, version: "1.0.0", private: true, type: "module", scripts: { dev: "tsx src/server.ts", build: "tsc", start: "node dist/server.js" }, dependencies: deps, devDependencies: dev }, null, 2) + "\n" },
    { path: "tsconfig.json", content: JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", outDir: "dist", rootDir: "src", strict: true, esModuleInterop: true, skipLibCheck: true } }, null, 2) + "\n" },
    { path: ".env.example", content: env },
    { path: "README.md", content: readme(spec, "ts") },
  ];
}

// ------------------------------------------------------------------------------------------------ Python

const pyType = (f: McpField) => {
  const base = f.type === "string" ? (f.options?.length ? `Literal[${f.options.map(q).join(", ")}]` : "str") : f.type === "integer" ? "int" : f.type === "number" ? "float" : "bool";
  return `Annotated[${base}, Field(description=${q(f.description)})]`;
};

function pyHandler(t: McpTool): string {
  const s = t.source;
  const req = t.fields.filter((f) => f.required), opt = t.fields.filter((f) => !f.required);
  const sig = [...req.map((f) => `${f.name}: ${pyType(f)}`), ...opt.map((f) => `${f.name}: ${pyType(f).replace(/\]$/, "]")} | None = None`)].join(", ");
  const head = `@mcp.tool(name=${q(t.name)}, description=${q(t.description)}, annotations=ToolAnnotations(readOnlyHint=${t.effect === "reads" ? "True" : "False"}, destructiveHint=${t.effect === "changes" ? "True" : "False"}, idempotentHint=False, openWorldHint=${s.kind === "http" ? "True" : "False"}))\ndef ${t.name}(${sig}) -> str:\n`;
  const args = `{${t.fields.map((f) => `${q(f.name)}: ${f.name}`).join(", ")}}`;
  if (s.kind === "http") {
    const url = parts(s.url).map((p) => ("lit" in p ? p.lit.replace(/[{}]/g, (c) => c + c).replace(/"/g, '\\"') : `{quote(str(${p.arg}), safe='')}`)).join("");
    return `${head}    headers = {"accept": "application/json"}
${s.secretName ? `    secret = os.environ.get(${q(s.secretName)})
    if not secret:
        return "The server is missing its credential (${s.secretName})."
    headers["authorization"] = f"Bearer {secret}"
` : ""}    data = ${s.method === "POST" ? `json.dumps(${args}).encode()` : "None"}
${s.method === "POST" ? `    headers["content-type"] = "application/json"\n` : ""}    return _call(urllib.request.Request(f"${url}", data=data, headers=headers, method=${q(s.method)}))
`;
  }
  if (s.kind === "sql") {
    const { sql, order } = positional(s.query, "percent");
    return `${head}    try:
        with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row, options="-c statement_timeout=10000") as conn:
            conn.read_only = True
            rows = conn.execute(${q(sql)}, (${order.map((n) => n).join(", ")}${order.length === 1 ? "," : ""})).fetchmany(200)
        return _text(json.dumps(rows, default=str))
    except Exception:
        return "The query failed."
`;
  }
  if (s.kind === "model") {
    return `${head}    body = json.dumps({"model": ${q(s.alias)}, "messages": [{"role": "system", "content": ${q(s.instruction)}}, {"role": "user", "content": json.dumps(${args})}]}).encode()
    req = urllib.request.Request(os.environ["TOKENER_GATEWAY_URL"] + "/v1/chat/completions", data=body, method="POST",
                                 headers={"content-type": "application/json", "authorization": "Bearer " + os.environ["TOKENER_API_KEY"]})
    out = _call(req, timeout=60)
    try:
        return _text(json.loads(out)["choices"][0]["message"]["content"])
    except Exception:
        return out
`;
  }
  return `${head}    base = f"{os.environ['TOKENER_API_URL']}/api/v1/orgs/{os.environ['TOKENER_ORG_ID']}/mlops"
    headers = {"content-type": "application/json", "authorization": "Bearer " + os.environ["TOKENER_API_KEY"]}
    start = urllib.request.Request(f"{base}/pipelines/${s.pipelineId}/runs", method="POST", data=json.dumps({"mode": "real", "input": ${args}}).encode(),
                                   headers={**headers, "idempotency-key": str(uuid.uuid4())})
    started = _call(start)
    try:
        run_id = json.loads(started)["id"]
    except Exception:
        return started
    deadline = time.time() + ${s.waitSeconds}
    while time.time() < deadline:
        try:
            status = json.loads(_call(urllib.request.Request(f"{base}/runs/{run_id}", headers=headers)))["status"]
        except Exception:
            status = None
        if status in ("succeeded", "failed", "validation-failed", "cancelled", "rolled-back"):
            return json.dumps({"runId": run_id, "status": status})
        time.sleep(2)
    return json.dumps({"runId": run_id, "status": "still running or waiting for approval"})
`;
}

export function generatePython(spec: McpServerSpec): GeneratedFile[] {
  const usesSql = spec.tools.some((t) => t.source.kind === "sql");
  const usesPipeline = spec.tools.some((t) => t.source.kind === "pipeline");
  const hasEnum = spec.tools.some((t) => t.fields.some((f) => f.options?.length));
  const guard = spec.auth === "api-key" ? `
class _Auth:
    """Rejects any request that does not carry the shared key. Compared in constant time."""
    def __init__(self, app):
        self.app = app
        self.key = os.environ["MCP_API_KEY"].encode()

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            given = dict(scope["headers"]).get(b"authorization", b"")
            token = given[7:] if given[:7].lower() == b"bearer " else b""
            if not hmac.compare_digest(token, self.key):
                await send({"type": "http.response.start", "status": 401, "headers": [(b"www-authenticate", b"Bearer"), (b"content-type", b"application/json")]})
                await send({"type": "http.response.body", "body": b'{"error": "unauthorised"}'})
                return
        await self.app(scope, receive, send)
` : "";
  const server = `import hmac
import json
import os
import time
import urllib.error
import urllib.request
import uuid
from typing import Annotated${hasEnum ? ", Literal" : ""}
from urllib.parse import quote

import uvicorn
from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations
from pydantic import Field
${usesSql ? "import psycopg\nfrom psycopg.rows import dict_row\n" : ""}
MAX = 20_000
mcp = MCPServer(${q(spec.slug)}, version=${q(`1.${spec.version}.0`)}, instructions=${q(spec.description)})


def _text(s: str) -> str:
    return s if len(s) <= MAX else s[:MAX] + "\\n[truncated]"


def _call(req: urllib.request.Request, timeout: int = 15) -> str:
    # No redirects are followed, so a response cannot send the call to another host.
    class _NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(req, timeout=timeout) as res:
            return _text(res.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        return f"The service answered {e.code}."
    except Exception:
        return "The service could not be reached."

${guard}
${spec.tools.map(pyHandler).join("\n\n")}

app = ${spec.auth === "api-key" ? "_Auth(mcp.streamable_http_app())" : "mcp.streamable_http_app()"}

if __name__ == "__main__":
    uvicorn.run(app, host=${q(spec.auth === "mtls" ? "127.0.0.1" : "0.0.0.0")}, port=int(os.environ.get("PORT", "3000")))
`;
  const reqs = ["mcp>=2,<3", "uvicorn>=0.30", ...(usesSql ? ["psycopg[binary]>=3.2"] : [])];
  void usesPipeline;
  const env = [
    spec.auth === "api-key" ? "MCP_API_KEY=" : "",
    ...Array.from(new Set(spec.tools.flatMap((t) => (t.source.kind === "http" && t.source.secretName ? [`${t.source.secretName}=`] : [])))),
    usesSql ? "DATABASE_URL=" : "",
    spec.tools.some((t) => t.source.kind === "model") ? "TOKENER_GATEWAY_URL=https://gateway.example.tokener.io\nTOKENER_API_KEY=" : "",
    usesPipeline ? "TOKENER_API_URL=https://api.example.tokener.io\nTOKENER_ORG_ID=\nTOKENER_API_KEY=" : "",
    "PORT=3000",
  ].filter(Boolean).join("\n").split("\n").filter((l, i, a) => a.indexOf(l) === i).join("\n") + "\n";
  return [
    { path: "server.py", content: server },
    { path: "requirements.txt", content: reqs.join("\n") + "\n" },
    { path: ".env.example", content: env },
    { path: "README.md", content: readme(spec, "py") },
  ];
}

export const PY_AUTH_NOTE = "The Python export supports an API key or no authentication. For OAuth use the TypeScript export, or put the server behind your gateway.";

function readme(spec: McpServerSpec, lang: "ts" | "py"): string {
  const run = lang === "ts" ? "npm install\nnpm run dev" : "python -m venv .venv && . .venv/bin/activate\npip install -r requirements.txt\npython server.py";
  return `# ${spec.name}

${spec.description || "A custom MCP server."}

Generated by tok∑ner. It serves Streamable HTTP at \`/mcp\` and exposes ${spec.tools.length} tool${spec.tools.length === 1 ? "" : "s"}:

${spec.tools.map((t) => `- \`${t.name}\`: ${t.description || "no description yet"}${t.effect === "changes" ? " (changes data through a pipeline, waits for approval)" : ""}`).join("\n")}

## Run

Copy \`.env.example\` to \`.env\`, fill in the values, export them, then:

\`\`\`
${run}
\`\`\`

Connect a client to \`http://localhost:3000/mcp\`${spec.auth === "api-key" ? " with the header `Authorization: Bearer <MCP_API_KEY>`" : ""}.

## Notes

- Nothing secret is written into the code. Credentials come from the environment.
- Tool results are cut at 20,000 characters.
- SQL tools run one read-only statement with bound parameters.
- Tools that change data start a tok∑ner pipeline. The approval gate, the audit record and the limits live there.
${spec.auth === "mtls" ? "- Terminate mutual TLS at your ingress or proxy. The server listens on the loopback address only.\n" : ""}${spec.auth === "none" ? "- This server has no authentication. Use it for development only.\n" : ""}`;
}

export function codeFor(spec: McpServerSpec, lang: "ts" | "py"): GeneratedFile[] {
  return lang === "ts" ? generateTypeScript(spec) : generatePython(spec);
}

export { isSingleSelect, sqlParams, envName };
