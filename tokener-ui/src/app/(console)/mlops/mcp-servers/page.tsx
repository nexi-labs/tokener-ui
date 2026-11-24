"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cable, Plus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { EnvBadge, GuardButton, Loading, Modal, Notice, relTime, useRole } from "@/components/mlops/ui";
import { endpointFor, type McpAuth, type McpEnv } from "@/lib/mlops/mcp-model";
import { mcpServers, useMcpServers } from "@/lib/mlops/mcp-servers";
import { toast } from "@/lib/mlops/toast";
import { activeCount, useMcpGrants } from "@/lib/mlops/mcp-access-store";

export default function McpServersPage() {
  const servers = useMcpServers();
  const grants = useMcpGrants();
  const role = useRole();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [env, setEnv] = useState<McpEnv>("development");
  const [auth, setAuth] = useState<McpAuth>("api-key");
  const [copyOf, setCopyOf] = useState("");
  const [err, setErr] = useState("");

  if (!servers) return <Loading />;

  const create = async () => {
    const r = await mcpServers.create({ name, env, auth, copyOf: copyOf || undefined });
    if (!r.ok) { setErr(r.error); return; }
    toast("Server created");
    setOpen(false);
    router.push(`/mlops/mcp-servers/${r.id}`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="MCP servers"
        description="Build your own Model Context Protocol servers from pipelines, SQL queries, HTTPS endpoints and gateway models. The control plane hosts them with authentication, policy, rate limits and audit, or you can export the project and run it yourself."
        action={<GuardButton action="pipeline.edit" role={role} variant="primary" onClick={() => { setErr(""); setOpen(true); }}><Plus size={15} /> New server</GuardButton>}
      />
      <Card>
        {servers.length === 0 ? (
          <EmptyState icon={Cable} title="No custom servers yet" description="Create a server, add tools and publish it. Any MCP client can then connect to it." action={<Button variant="primary" onClick={() => setOpen(true)}>New server</Button>} />
        ) : (
          <Table>
            <Thead><tr><Th>Server</Th><Th>Environment</Th><Th>Tools</Th><Th>Sign-in</Th><Th>Callers</Th><Th>Endpoint</Th><Th>State</Th><Th>Updated</Th></tr></Thead>
            <tbody>
              {servers.map((s) => (
                <Tr key={s.id}>
                  <Td><Link href={`/mlops/mcp-servers/${s.id}`} className="font-medium hover:underline">{s.name}</Link><div className="text-xs text-text-tertiary max-w-sm truncate">{s.description}</div></Td>
                  <Td><EnvBadge env={s.env} /></Td>
                  <Td className="tabular-nums">{s.tools.length}</Td>
                  <Td className="capitalize">{s.auth === "api-key" ? "API key" : s.auth === "oauth" ? "OAuth" : s.auth === "mtls" ? "Mutual TLS" : "None"}</Td>
                  <Td><Link href={`/mlops/mcp-servers/${s.id}/access`} className="text-[13px] hover:underline tabular-nums">{grants ? activeCount(grants, s.id) : 0} with access</Link></Td>
                  <Td><span className="font-code text-xs text-text-secondary">{endpointFor(s)}</span></Td>
                  <Td>{s.status === "published" ? <Badge tone="healthy">Published v{s.version}</Badge> : <Badge>Draft</Badge>}</Td>
                  <Td className="text-xs text-text-tertiary">{relTime(s.updatedAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New MCP server"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={create}>Create server</Button></>}>
        <div className="space-y-4">
          {err && <Notice tone="bad">{err}</Notice>}
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer support tools" autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Environment">
              <Select value={env} onChange={(e) => setEnv(e.target.value as McpEnv)}>
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </Select>
            </Field>
            <Field label="Access">
              <Select value={auth} onChange={(e) => setAuth(e.target.value as McpAuth)}>
                <option value="api-key">API key</option>
                <option value="oauth">OAuth</option>
                <option value="mtls">Mutual TLS</option>
                {env === "development" && <option value="none">None</option>}
              </Select>
            </Field>
          </div>
          <Field label="Start from" hint="Copy the tools of an existing server, or start empty.">
            <Select value={copyOf} onChange={(e) => setCopyOf(e.target.value)}>
              <option value="">Empty server</option>
              {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
