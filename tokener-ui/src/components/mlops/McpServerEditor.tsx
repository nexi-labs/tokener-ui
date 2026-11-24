"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronRight, Copy, Users, Database, Download, Globe, Plus, Power, Rocket, Sparkles, Trash2, Workflow } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { CodeBlock, Confirm, EnvBadge, GuardButton, Loading, Notice, Tabs, relTime, useRole } from "./ui";
import { integrationById } from "@/lib/mlops/catalog";
import { codeFor, PY_AUTH_NOTE } from "@/lib/mlops/mcp-codegen";
import { endpointFor, errors, toolsList, validateServer, type McpField, type McpTool, type ToolSource } from "@/lib/mlops/mcp-model";
import { flushMcpEdits, mcpServers, useMcpProblem, useMcpSaving, useMcpServers } from "@/lib/mlops/mcp-servers";
import { can } from "@/lib/mlops/rbac";
import { useMlops, useMlopsStatus } from "@/lib/mlops/store";
import { toast } from "@/lib/mlops/toast";
import { downloadZip } from "@/lib/zip";

const KIND_LABEL: Record<ToolSource["kind"], string> = { http: "HTTP request", sql: "SQL query (read only)", pipeline: "Pipeline", model: "Model through the gateway" };
const KIND_ICON = { http: Globe, sql: Database, pipeline: Workflow, model: Sparkles } as const;
const KIND_HELP: Record<ToolSource["kind"], string> = {
  http: "Calls an HTTPS endpoint you own. Arguments are URL encoded into the address, or sent as a JSON body.",
  sql: "Runs one SELECT with bound parameters inside a read-only transaction on a data connection.",
  pipeline: "Starts a published pipeline and returns its result. Use this for anything that changes data, so an approval gate stays in the path.",
  model: "Asks a model through the tok∑ner gateway, so policy, budget and metering apply.",
};

export function McpServerEditor({ id }: { id: string }) {
  const servers = useMcpServers();
  const mlops = useMlops();
  const role = useRole();
  const router = useRouter();
  const [tab, setTab] = useState<"checks" | "preview" | "connect" | "code">("checks");
  const [pick, setPick] = useState<string | null>(null);
  const [lang, setLang] = useState<"ts" | "py">("ts");
  const [del, setDel] = useState(false);

  const server = servers?.find((s) => s.id === id);
  const issues = useMemo(() => (server && servers ? validateServer(server, servers) : []), [server, servers]);
  const live = useMlopsStatus().mode === "live";
  const saving = useMcpSaving();
  const problem = useMcpProblem();
  useEffect(() => () => { void flushMcpEdits(); }, []);
  if (!servers || !mlops) return <Loading />;
  if (!server) {
    return (
      <div className="space-y-4">
        <PageHeader title="Server not found" description="It may have been deleted in another tab." />
        <Link href="/mlops/mcp-servers" className="text-sm underline">Back to MCP servers</Link>
      </div>
    );
  }

  const canEdit = can(role, "pipeline.edit", server.env);
  const editReason = canEdit.ok ? undefined : canEdit.reason;
  const bad = errors(issues);
  const endpoint = endpointFor(server);
  const selected = server.tools.find((t) => t.id === pick) ?? server.tools[0];
  const upd = (patch: Parameters<typeof mcpServers.update>[1]) => { const r = mcpServers.update(id, patch); if (!r.ok) toast(r.error, "error"); };
  const updTool = (toolId: string, patch: Partial<McpTool>) => upd({ tools: server.tools.map((t) => (t.id === toolId ? { ...t, ...patch } : t)) });
  const files = codeFor(server, lang);

  const connectJson = JSON.stringify({ mcpServers: { [server.slug]: { type: "http", url: endpoint, ...(server.auth === "api-key" ? { headers: { Authorization: "Bearer ${TOKENER_MCP_KEY}" } } : {}) } } }, null, 2);
  const sdkSnippet = `import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = new Client({ name: "my-agent", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL("${endpoint}")${server.auth === "api-key" ? `, {
  requestInit: { headers: { authorization: \`Bearer \${process.env.TOKENER_MCP_KEY}\` } },
}` : ""}));

const { tools } = await client.listTools();
const result = await client.callTool({ name: "${server.tools[0]?.name ?? "tool_name"}", arguments: {} });`;
  const curl = `curl -sS ${endpoint} \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\${server.auth === "api-key" ? "\n  -H \"Authorization: Bearer $TOKENER_MCP_KEY\" \\" : ""}
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'`;

  const publish = async () => { const r = await mcpServers.publish(id); r.ok ? toast(`Published version ${r.version}`) : toast(r.error, "error"); };

  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-text-tertiary">
        <Link href="/mlops/mcp-servers" className="hover:text-text-primary">MCP servers</Link><ChevronRight size={13} /><span className="text-text-primary">{server.name}</span>
        {live && <span role="status" className={`ml-auto text-xs ${problem ? "text-[#b42318]" : "text-text-tertiary"}`}>{problem ? `Not saved: ${problem}` : saving ? "Saving" : "All changes saved"}</span>}
      </nav>
      <PageHeader title={server.name} description={server.description || "Add a description so people know what this server is for."}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {server.status === "published"
              ? <GuardButton action="pipeline.publish" env={server.env} role={role} onClick={async () => { const r = await mcpServers.unpublish(id); r.ok ? toast("Taken offline") : toast(r.error, "error"); }}><Power size={15} /> Take offline</GuardButton>
              : <GuardButton action="pipeline.publish" env={server.env} role={role} variant="primary" onClick={publish} extraDisabled={bad.length ? `${bad.length} problem${bad.length === 1 ? "" : "s"} to fix first` : undefined}><Rocket size={15} /> Publish</GuardButton>}
            <Link href={`/mlops/mcp-servers/${server.id}/access`}><Button><Users size={15} /> Manage access</Button></Link>
            <GuardButton action="connection.delete" env={server.env} role={role} onClick={() => setDel(true)}><Trash2 size={15} /> Delete</GuardButton>
          </div>
        } />
      <div className="flex flex-wrap items-center gap-2 -mt-3">
        <Badge tone={server.status === "published" ? "healthy" : "neutral"}>{server.status === "published" ? `Published, version ${server.version}` : server.version ? `Draft, last published version ${server.version}` : "Draft"}</Badge>
        <EnvBadge env={server.env} />
        <span className="text-xs text-text-tertiary">Updated {relTime(server.updatedAt)}</span>
        <button onClick={() => { void navigator.clipboard?.writeText(endpoint); toast("Address copied"); }} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border-strong px-2 h-7 text-xs font-code text-text-secondary hover:bg-surface-muted"><Copy size={12} />{endpoint}</button>
      </div>
      {editReason && <Notice tone="warn" title="Read only">{editReason}</Notice>}

      <div className="grid xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-5 items-start">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Server" subtitle="How clients find and trust it" />
            <CardBody>
              <fieldset disabled={!canEdit.ok} className="grid sm:grid-cols-2 gap-4">
                <Field label="Name"><Input value={server.name} onChange={(e) => upd({ name: e.target.value })} /></Field>
                <Field label="Address" hint={endpoint}><Input value={server.slug} onChange={(e) => upd({ slug: e.target.value.toLowerCase() })} /></Field>
                <div className="sm:col-span-2"><Field label="Description" hint="Clients show this to people choosing which servers to connect."><Input value={server.description} onChange={(e) => upd({ description: e.target.value })} /></Field></div>
                <Field label="Environment" hint="Fixed once published"><Select value={server.env} disabled={server.status === "published" || !canEdit.ok} onChange={(e) => upd({ env: e.target.value as typeof server.env })}><option value="development">Development</option><option value="staging">Staging</option><option value="production">Production</option></Select></Field>
                <Field label="Access" hint={server.auth === "oauth" ? "OAuth 2.1 with tokens issued for this server only." : server.auth === "mtls" ? "Client certificates, checked at the edge." : undefined}>
                  <Select value={server.auth} onChange={(e) => upd({ auth: e.target.value as typeof server.auth })}><option value="api-key">API key</option><option value="oauth">OAuth 2.1</option><option value="mtls">Mutual TLS</option><option value="none">None (development only)</option></Select>
                </Field>
                <Field label="Calls per minute"><Input type="number" min={1} max={6000} value={server.ratePerMinute} onChange={(e) => upd({ ratePerMinute: Number(e.target.value) })} /></Field>
                <Field label="Audit record keeps"><Select value={server.audit} onChange={(e) => upd({ audit: e.target.value as typeof server.audit })}><option value="metadata">Tool, caller, duration, outcome</option><option value="arguments">The same, plus arguments</option></Select></Field>
                <div className="sm:col-span-2"><Toggle checked={server.redactResults} onChange={(v) => upd({ redactResults: v })} label="Redact secrets and personal data in results" description="Applied before a result is returned to the client or written to a log." /></div>
              </fieldset>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={`Tools (${server.tools.length})`} subtitle="What a model can ask this server to do"
              action={
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(KIND_LABEL) as ToolSource["kind"][]).map((k) => {
                    const I = KIND_ICON[k];
                    return <button key={k} disabled={!canEdit.ok} title={editReason ?? `Add a tool backed by ${KIND_LABEL[k].toLowerCase()}`} onClick={async () => { const r = await mcpServers.addTool(id, k); if (r.ok) setPick(r.toolId); else toast(r.error, "error"); }}
                      className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-border-strong text-xs text-text-secondary hover:bg-surface-muted disabled:opacity-50"><Plus size={12} /><I size={13} />{k === "sql" ? "SQL" : k === "http" ? "HTTP" : k === "pipeline" ? "Pipeline" : "Model"}</button>;
                  })}
                </div>
              } />
            <div className="grid md:grid-cols-[210px_minmax(0,1fr)]">
              <ul className="border-b md:border-b-0 md:border-r border-border p-2 flex md:flex-col gap-1 overflow-x-auto" aria-label="Tools">
                {server.tools.map((t) => {
                  const I = KIND_ICON[t.source.kind];
                  const has = issues.filter((i) => i.where === t.name).length;
                  return (
                    <li key={t.id}>
                      <button onClick={() => setPick(t.id)} aria-current={selected?.id === t.id} className={clsx("w-full text-left px-2.5 py-2 rounded-md flex items-center gap-2 text-[13px] whitespace-nowrap", selected?.id === t.id ? "bg-surface-muted text-text-primary" : "text-text-secondary hover:bg-surface-subtle")}>
                        <I size={14} className="shrink-0 text-text-tertiary" /><span className="font-code truncate">{t.name || "unnamed"}</span>
                        {t.effect === "changes" && <span className="text-[10px] uppercase tracking-wider text-status-degraded">writes</span>}
                        {has > 0 && <AlertTriangle size={12} className="ml-auto text-status-degraded shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {selected ? <ToolEditor key={selected.id} tool={selected} disabled={!canEdit.ok} onChange={(p) => updTool(selected.id, p)} onRemove={() => { upd({ tools: server.tools.filter((t) => t.id !== selected.id) }); setPick(null); }} /> : <p className="p-5 text-sm text-text-secondary">Add a tool to get started.</p>}
            </div>
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-4">
          <Tabs label="Server views" value={tab} onChange={setTab} tabs={[
            { id: "checks", label: "Checks", count: issues.length },
            { id: "preview", label: "Preview" },
            { id: "connect", label: "Connect" },
            { id: "code", label: "Code" },
          ]} />

          {tab === "checks" && (
            <div className="space-y-3">
              {bad.length === 0
                ? <Notice tone="ok" title="Ready to publish">No blocking problems. {issues.length ? `${issues.length} suggestion${issues.length === 1 ? "" : "s"} below.` : ""}</Notice>
                : <Notice tone="bad" title={`${bad.length} problem${bad.length === 1 ? "" : "s"} to fix before publishing`}>Fix these, then publish. The server runs the same checks again when it publishes.</Notice>}
              {issues.length > 0 && (
                <ul className="border border-border rounded-lg divide-y divide-border bg-surface">
                  {issues.map((i, n) => (
                    <li key={n} className="p-3 flex gap-3 text-[13px]">
                      {i.level === "error" ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-status-down" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-status-degraded" />}
                      <div><span className="font-medium text-text-primary">{i.where}</span><p className="text-text-secondary mt-0.5">{i.text}</p></div>
                    </li>
                  ))}
                </ul>
              )}
              <Notice tone="info" title="How servers are hosted">
                A published server is served by tok&#8721;ner at the address above, behind the access setting you chose, with every call checked, rate limited and audited. {live ? "Edits are saved as you type. " : "This sample console keeps servers in your browser. "}The Code tab gives you the same server as a project you can run yourself.
              </Notice>
            </div>
          )}

          {tab === "preview" && (
            <div className="space-y-3">
              <p className="text-[13px] text-text-secondary">This is the answer to <code className="font-code text-[12px]">tools/list</code>. A model decides which tool to call from these names, descriptions and schemas, so write them for the model.</p>
              <CodeBlock code={JSON.stringify(toolsList(server), null, 2)} language="json" title="tools/list result" maxHeight={520} />
            </div>
          )}

          {tab === "connect" && (
            <div className="space-y-4">
              <p className="text-[13px] text-text-secondary">Any MCP client that speaks Streamable HTTP can use the address. {server.auth === "api-key" ? "Create the key under API Keys and keep it in an environment variable." : server.auth === "oauth" ? "Clients discover the authorization server from the server's protected resource metadata." : ""}</p>
              <CodeBlock code={connectJson} language="json" title=".mcp.json (Claude Code and compatible clients)" maxHeight={220} />
              <CodeBlock code={sdkSnippet} language="ts" title="TypeScript SDK" maxHeight={260} />
              <CodeBlock code={curl} language="sh" title="Check the connection with curl" maxHeight={200} />
            </div>
          )}

          {tab === "code" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-md border border-border-strong p-0.5 bg-surface-subtle" role="group" aria-label="Language">
                  {(["ts", "py"] as const).map((l) => <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} className={clsx("h-7 px-3 rounded text-[13px] font-medium", lang === l ? "bg-surface text-text-primary shadow-card" : "text-text-secondary")}>{l === "ts" ? "TypeScript" : "Python"}</button>)}
                </div>
                <Button onClick={() => { downloadZip(`${server.slug}-${lang === "ts" ? "node" : "python"}.zip`, files.map((f) => ({ path: `${server.slug}/${f.path}`, content: f.content }))); toast("Project downloaded"); }}><Download size={14} /> Download project</Button>
              </div>
              <p className="text-[13px] text-text-secondary">A working server for the official {lang === "ts" ? "TypeScript SDK" : "Python SDK"} with one tool for each tool here. No secrets are written into it. {lang === "py" && server.auth === "oauth" ? PY_AUTH_NOTE : ""}</p>
              {files.map((f) => (
                <details key={f.path} open={f.path.startsWith("src/") || f.path === "server.py"} className="group">
                  <summary className="cursor-pointer text-[13px] font-code text-text-primary flex items-center gap-1.5 py-1"><Check size={12} className="text-status-healthy" />{f.path}</summary>
                  <CodeBlock code={f.content} language={f.path.endsWith(".ts") ? "ts" : f.path.endsWith(".py") ? "py" : "text"} maxHeight={420} />
                </details>
              ))}
            </div>
          )}
        </div>
      </div>

      <Confirm open={del} onClose={() => setDel(false)} title="Delete this server?" danger phrase={server.name} confirmLabel="Delete server"
        body="Clients connected to it will stop working. This cannot be undone." onConfirm={async () => { const r = await mcpServers.remove(id); if (r.ok) { toast("Server deleted"); router.push("/mlops/mcp-servers"); } else toast(r.error, "error"); setDel(false); }} />
    </div>
  );
}

function ToolEditor({ tool, disabled, onChange, onRemove }: { tool: McpTool; disabled: boolean; onChange: (p: Partial<McpTool>) => void; onRemove: () => void }) {
  const mlops = useMlops();
  const src = tool.source;
  const setSrc = (p: Partial<ToolSource>) => onChange({ source: { ...src, ...p } as ToolSource });
  const setField = (i: number, p: Partial<McpField>) => onChange({ fields: tool.fields.map((f, n) => (n === i ? { ...f, ...p } : f)) });
  const sqlConns = (mlops?.connections ?? []).filter((c) => integrationById(c.integrationId)?.family === "relational");
  const pipelines = mlops?.pipelines ?? [];
  const Help = KIND_HELP[src.kind];

  return (
    <fieldset disabled={disabled} className="p-5 space-y-4 min-w-0">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Tool name" hint="Lowercase letters, digits and underscores"><Input value={tool.name} onChange={(e) => onChange({ name: e.target.value })} className="font-code" /></Field>
        <Field label="What it does to data">
          <Select value={tool.effect} onChange={(e) => { const effect = e.target.value as McpTool["effect"]; onChange({ effect, approval: effect === "changes" ? true : tool.approval }); }}>
            <option value="reads">Reads only</option><option value="changes">Changes data (waits for approval)</option>
          </Select>
        </Field>
      </div>
      <Field label="Description" hint="The model reads this to decide when to call the tool. Say what it returns and when to use it.">
        <textarea value={tool.description} onChange={(e) => onChange({ description: e.target.value })} rows={3} className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-500/40" />
      </Field>

      <div className="rounded-lg border border-border bg-surface-subtle p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-medium">Backed by</span>
          <Select value={src.kind} aria-label="Source kind" className="!w-auto" onChange={(e) => {
            const k = e.target.value as ToolSource["kind"];
            const next: ToolSource = k === "http" ? { kind: k, method: "GET", url: "https://api.example.com/items/{{item_id}}" } : k === "sql" ? { kind: k, connectionId: sqlConns[0]?.id ?? "", query: "select * from items where id = :item_id limit 20" } : k === "pipeline" ? { kind: k, pipelineId: pipelines[0]?.id ?? "", waitSeconds: 60 } : { kind: k, alias: "chat-default", instruction: "Answer briefly and only from the input." };
            onChange({ source: next, effect: k === "pipeline" ? tool.effect : "reads", approval: k === "pipeline" ? tool.approval : false });
          }}>
            {(Object.keys(KIND_LABEL) as ToolSource["kind"][]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </Select>
        </div>
        <p className="text-xs text-text-tertiary">{Help}</p>
        {src.kind === "http" && (
          <div className="grid sm:grid-cols-[120px_1fr] gap-3">
            <Field label="Method"><Select value={src.method} onChange={(e) => setSrc({ method: e.target.value as "GET" | "POST" })}><option>GET</option><option>POST</option></Select></Field>
            <Field label="Address" hint="Use {{field}} in the path or query. Credentials go in a secret, not the address."><Input value={src.url} onChange={(e) => setSrc({ url: e.target.value })} className="font-code" /></Field>
            <div className="sm:col-span-2"><Field label="Secret name" hint="An environment variable or vault entry holding a bearer token. Leave empty for none."><Input value={src.secretName ?? ""} onChange={(e) => setSrc({ secretName: e.target.value || undefined })} className="font-code" placeholder="ORDERS_API_TOKEN" /></Field></div>
          </div>
        )}
        {src.kind === "sql" && (
          <div className="space-y-3">
            <Field label="Data connection">
              <Select value={src.connectionId} onChange={(e) => setSrc({ connectionId: e.target.value })}>
                <option value="">Choose a connection</option>
                {sqlConns.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.env})</option>)}
              </Select>
            </Field>
            <Field label="Query" hint="One SELECT. Use :field for values. Add a LIMIT."><textarea value={src.query} onChange={(e) => setSrc({ query: e.target.value })} rows={4} className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-[13px] font-code focus:outline-none focus:ring-2 focus:ring-accent-500/40" /></Field>
          </div>
        )}
        {src.kind === "pipeline" && (
          <div className="grid sm:grid-cols-[1fr_160px] gap-3">
            <Field label="Pipeline" hint="Arguments arrive as the run's input.">
              <Select value={src.pipelineId} onChange={(e) => setSrc({ pipelineId: e.target.value })}>
                <option value="">Choose a pipeline</option>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Wait up to (seconds)"><Input type="number" min={1} max={300} value={src.waitSeconds} onChange={(e) => setSrc({ waitSeconds: Number(e.target.value) })} /></Field>
          </div>
        )}
        {src.kind === "model" && (
          <div className="grid sm:grid-cols-[200px_1fr] gap-3">
            <Field label="Model alias"><Input value={src.alias} onChange={(e) => setSrc({ alias: e.target.value })} className="font-code" /></Field>
            <Field label="Instruction"><Input value={src.instruction} onChange={(e) => setSrc({ instruction: e.target.value })} /></Field>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[13px] font-semibold">Arguments</h4>
          <button type="button" onClick={() => onChange({ fields: [...tool.fields, { name: `field_${tool.fields.length + 1}`, type: "string", required: true, description: "" }] })} className="text-xs inline-flex items-center gap-1 text-text-secondary hover:text-text-primary disabled:opacity-50"><Plus size={12} /> Add argument</button>
        </div>
        {tool.fields.length === 0 ? <p className="text-xs text-text-tertiary">This tool takes no arguments.</p> : (
          <div className="space-y-2">
            {tool.fields.map((f, i) => (
              <div key={i} className="rounded-lg border border-border bg-surface p-2.5 grid grid-cols-[minmax(0,1fr)_130px_auto_auto] gap-2 items-center">
                <Input aria-label="Argument name" value={f.name} onChange={(e) => setField(i, { name: e.target.value })} className="font-code" />
                <Select aria-label="Type" value={f.type} onChange={(e) => setField(i, { type: e.target.value as McpField["type"] })}><option value="string">text</option><option value="integer">whole number</option><option value="number">number</option><option value="boolean">yes or no</option></Select>
                <label className="flex items-center gap-1.5 text-xs text-text-secondary px-1"><input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />required</label>
                <button type="button" aria-label={`Remove argument ${f.name}`} onClick={() => onChange({ fields: tool.fields.filter((_, n) => n !== i) })} className="h-9 w-9 grid place-items-center rounded-md text-text-tertiary hover:bg-surface-muted"><Trash2 size={14} /></button>
                <div className="col-span-4"><Input aria-label="Description" placeholder="What it means, for the model" value={f.description} onChange={(e) => setField(i, { description: e.target.value })} /></div>
                {f.type === "string" && (
                  <div className="col-span-4"><Input aria-label="Allowed values" placeholder="Allowed values, separated by commas (optional)" value={(f.options ?? []).join(", ")} onChange={(e) => setField(i, { options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} className="h-8 text-xs" /></div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end pt-1">
        <button type="button" onClick={onRemove} className="text-xs inline-flex items-center gap-1.5 text-status-down hover:underline"><Trash2 size={13} /> Remove this tool</button>
      </div>
    </fieldset>
  );
}
