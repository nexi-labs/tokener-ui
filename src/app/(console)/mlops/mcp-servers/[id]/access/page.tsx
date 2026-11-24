"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, KeyRound, Plus, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { CodeBlock, Confirm, EnvBadge, GuardButton, Loading, Modal, Notice, relTime, useRole } from "@/components/mlops/ui";
import { KIND_LABEL, SAMPLE_DIRECTORY, decide, isExpired, needsKey, type Grant, type Principal, type PrincipalKind, type ToolScope } from "@/lib/mlops/mcp-access";
import { mcpAccess, useMcpGrants, useMcpGrantsLoaded, useMcpGrantsProblem } from "@/lib/mlops/mcp-access-store";
import { mcpApi } from "@/lib/mlops/live/mcp";
import { liveOrgId, useMlopsStatus } from "@/lib/mlops/store";
import { useMcpServers } from "@/lib/mlops/mcp-servers";
import { toast } from "@/lib/mlops/toast";

const EXPIRY: { v: number | null; label: string }[] = [{ v: 7, label: "7 days" }, { v: 30, label: "30 days" }, { v: 90, label: "90 days" }, { v: null, label: "No expiry" }];
const stateOf = (g: Grant) => (g.status === "revoked" ? "revoked" : isExpired(g) ? "expired" : "active");
const TONE = { active: "healthy", expired: "degraded", revoked: "neutral" } as const;

export default function McpAccessPage() {
  const { id } = useParams<{ id: string }>();
  const servers = useMcpServers();
  const grants = useMcpGrants();
  const role = useRole();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PrincipalKind>("user");
  const [who, setWho] = useState("");
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [scope, setScope] = useState<ToolScope>("reads");
  const [rate, setRate] = useState(60);
  const [exp, setExp] = useState<number | null>(30);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [secret, setSecret] = useState<null | { label: string; key: string }>(null);
  const [revoke, setRevoke] = useState<Grant | null>(null);
  const [tp, setTp] = useState(""), [tt, setTt] = useState("");
  const isLive = useMlopsStatus().mode === "live";
  const loaded = useMcpGrantsLoaded(id);
  const problem = useMcpGrantsProblem();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Principal[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [busy, setBusy] = useState(false);

  // A signed-in workspace picks the caller from the organisation's own people, applications and service accounts. Groups are not in the directory yet.
  useEffect(() => {
    const org = liveOrgId();
    if (!isLive || !open || !org) return;
    let off = false;
    setSearching(true);
    const t = setTimeout(() => {
      mcpApi.principals(org, kind, query).then((r) => { if (!off) { setFound(r); setSearchErr(""); setSearching(false); } })
        .catch((e: Error) => { if (!off) { setFound([]); setSearchErr(e.message); setSearching(false); } });
    }, 250);
    return () => { off = true; clearTimeout(t); };
  }, [isLive, open, kind, query]);

  const server = servers?.find((s) => s.id === id);
  const mine = useMemo(() => (grants ?? []).filter((g) => g.serverId === id), [grants, id]);
  if (!servers || !grants || !loaded) return <Loading />;
  if (!server) return <div className="p-8 text-sm text-text-secondary">This server does not exist. <Link className="underline" href="/mlops/mcp-servers">Back to MCP servers</Link></div>;

  const kinds = (Object.keys(KIND_LABEL) as PrincipalKind[]).filter((k) => !isLive || k !== "group");
  const dir = isLive ? found : SAMPLE_DIRECTORY.filter((p) => p.kind === kind);
  const principal = dir.find((p) => p.id === (who || dir[0]?.id));
  const callers: Principal[] = isLive ? [...new Map(mine.map((g) => [g.principal.id, g.principal])).values()] : SAMPLE_DIRECTORY;
  const hasChanging = server.tools.some((t) => t.effect === "changes");
  const tool = server.tools.find((t) => t.id === (tt || server.tools[0]?.id));
  const caller = callers.find((p) => p.id === (tp || callers[0]?.id));
  const verdict = caller ? decide(grants, id, caller.id, tool) : null;

  const submit = async () => {
    if (!principal || busy) return;
    setBusy(true);
    const r = await mcpAccess.grant(server, { serverId: id, principal, tools: all ? "all" : picked, scope, ratePerMinute: rate, expiresInDays: exp, note });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    toast(`${principal.label} now has access`);
    setOpen(false); setNote(""); setErr(""); setPicked([]); setQuery("");
    if (r.key) setSecret({ label: principal.label, key: r.key });
  };
  const rotate = async (g: Grant) => { const r = await mcpAccess.rotateKey(server, g.id); r.ok ? setSecret({ label: g.principal.label, key: r.key }) : toast(r.error, "error"); };

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-text-tertiary">
        <Link href="/mlops/mcp-servers" className="hover:text-text-primary">MCP servers</Link><ChevronRight size={13} />
        <Link href={`/mlops/mcp-servers/${server.id}`} className="hover:text-text-primary">{server.name}</Link><ChevronRight size={13} /><span className="text-text-primary">Access</span>
      </nav>
      <PageHeader title="Who can use this server" description={`Give ${isLive ? "people, applications and service accounts" : "people, groups, applications and service accounts"} access to specific tools, with their own rate limit and expiry. Anyone without a grant is refused.`}
        action={<GuardButton action="pipeline.edit" env={server.env} role={role} variant="primary" onClick={() => { setErr(""); setOpen(true); }}><Plus size={15} /> Grant access</GuardButton>} />
      <div className="flex flex-wrap items-center gap-2 -mt-3"><EnvBadge env={server.env} /><Badge tone={server.status === "published" ? "healthy" : "neutral"}>{server.status === "published" ? `Published v${server.version}` : "Draft"}</Badge><span className="text-xs text-text-tertiary">Server limit {server.ratePerMinute} calls per minute, authenticated by {server.auth === "api-key" ? "API key" : server.auth === "oauth" ? "OAuth" : server.auth === "mtls" ? "mutual TLS" : "nothing"}.</span></div>
      {problem && <Notice tone="bad" title="Access could not be read">{problem}</Notice>}
      {server.auth === "none" && <Notice tone="warn" title="This server has no authentication">Grants cannot be enforced without a way to tell callers apart. Choose API key, OAuth or mutual TLS on the server page.</Notice>}

      <Card>
        {mine.length === 0 ? <div className="p-8 text-center text-[13px] text-text-secondary">Nobody has access yet. Grant access to a person, a group, an application or a service account.</div> : (
          <Table>
            <Thead><tr><Th>Caller</Th><Th>Tools</Th><Th>May</Th><Th>Rate</Th><Th>Credential</Th><Th>State and actions</Th></tr></Thead>
            <tbody>
              {mine.map((g) => {
                const st = stateOf(g);
                return (
                  <Tr key={g.id}>
                    <Td className="min-w-[230px]"><div className="font-medium whitespace-nowrap">{g.principal.label} <span className="text-xs font-normal text-text-tertiary">{KIND_LABEL[g.principal.kind]}</span></div><div className="text-xs text-text-tertiary mt-0.5 max-w-[260px]">{g.note}</div></Td>
                    <Td className="text-[13px] min-w-[190px]">{g.tools === "all" ? "All tools" : g.tools.map((t) => server.tools.find((x) => x.id === t)?.name ?? "removed tool").join(", ")}</Td>
                    <Td className="text-[13px] whitespace-nowrap">{g.scope === "changes" ? "Read and change" : "Read only"}</Td>
                    <Td className="tabular-nums whitespace-nowrap">{g.ratePerMinute}/min</Td>
                    <Td className="text-xs">{g.key ? <span><span className="font-code">{g.key.prefix}...</span><div className="text-text-tertiary">issued {relTime(g.key.issuedAt)}</div></span> : <span className="text-text-tertiary">{needsKey(g.principal) ? "None" : "Signs in"}</span>}</Td>
                    <Td><Badge tone={TONE[st]}>{st}</Badge><div className="text-[11px] text-text-tertiary mt-1 whitespace-nowrap">{g.expiresAt && st !== "revoked" ? `${st === "expired" ? "ended" : "until"} ${new Date(g.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : st === "active" ? "no expiry" : ""}</div><div className="flex gap-1 -ml-2.5 mt-1.5 whitespace-nowrap">{st === "active" && g.key && <Button variant="ghost" className="h-7 px-2.5 text-[13px]" onClick={() => rotate(g)}><KeyRound size={14} /> Rotate</Button>}
                      {st === "active" && <Button variant="ghost" className="h-7 px-2.5 text-[13px]" onClick={() => setRevoke(g)}>Revoke</Button>}</div></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Test a call" subtitle="Pick a caller and a tool to see what the server would do, without sending anything" />
        <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <Field label="Caller" hint={isLive && !callers.length ? "Nobody has access yet." : undefined}><Select value={caller?.id ?? ""} disabled={!callers.length} onChange={(e) => setTp(e.target.value)}>{callers.map((p) => <option key={p.id} value={p.id}>{p.label} ({KIND_LABEL[p.kind].toLowerCase()})</option>)}</Select></Field>
          <Field label="Tool"><Select value={tool?.id ?? ""} onChange={(e) => setTt(e.target.value)}>{server.tools.map((t) => <option key={t.id} value={t.id}>{t.name}{t.effect === "changes" ? " (changes data)" : ""}</option>)}</Select></Field>
          <div className="pt-6">{!verdict ? <p className="text-xs text-text-secondary">Grant access to someone first, then test what they can call.</p> : <><div className="flex items-center gap-2"><Badge tone={verdict.allowed ? "healthy" : "down"}>{verdict.allowed ? "Allowed" : "Refused"}</Badge>{verdict.allowed && <span className="text-xs text-text-tertiary tabular-nums">{verdict.ratePerMinute} per minute</span>}</div><p className="text-xs text-text-secondary mt-1.5 leading-relaxed">{verdict.reason}</p></>}</div>
        </CardBody>
      </Card>

      <Notice tone="info" title="How enforcement works"><span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} /></span> On every call the server identifies the caller from its key or sign-in, finds the grant, checks the tool and scope, applies the caller's rate limit and writes an audit record. Revoking a grant, or letting it expire, stops the caller on its next call. Tools that change data still wait for a person to approve where the tool says so.</Notice>

      <Modal open={open} onClose={() => setOpen(false)} title="Grant access" wide
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={busy || !principal} onClick={submit}>{busy ? "Granting" : "Grant access"}</Button></>}>
        <div className="space-y-4">
          {err && <Notice tone="bad">{err}</Notice>}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type of caller"><Select value={kind} onChange={(e) => { setKind(e.target.value as PrincipalKind); setWho(""); setQuery(""); }}>{kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</Select></Field>
            {isLive
              ? <Field label="Search by name" hint={searchErr || (searching ? "Searching" : `${found.length} found`)}><Input value={query} onChange={(e) => { setQuery(e.target.value); setWho(""); }} placeholder={kind === "user" ? "Name or email" : "Name"} /></Field>
              : <Field label="Caller"><Select value={principal?.id ?? ""} onChange={(e) => setWho(e.target.value)}>{dir.map((p) => <option key={p.id} value={p.id}>{p.label}{p.detail ? ` (${p.detail})` : ""}</option>)}</Select></Field>}
          </div>
          {isLive && (
            <Field label="Caller" hint={dir.length ? undefined : "Nobody matches. Applications and service accounts appear here once they exist under this organisation."}>
              <Select value={principal?.id ?? ""} disabled={!dir.length} onChange={(e) => setWho(e.target.value)}>{dir.map((p) => <option key={p.id} value={p.id}>{p.label}{p.detail ? ` (${p.detail})` : ""}</option>)}</Select>
            </Field>
          )}
          {principal && needsKey(principal) && <p className="text-xs text-text-secondary">A key is created for this caller and shown once. Store it in a secret manager. The platform keeps only its first characters.</p>}
          <Toggle checked={all} onChange={setAll} label="Every tool on this server" description="Includes tools added later, within the permission below." />
          {!all && (
            <div className="rounded-md border border-border divide-y divide-border">
              {server.tools.map((t) => (
                <label key={t.id} className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-surface-subtle">
                  <input type="checkbox" className="h-4 w-4 accent-[#02F5A1]" checked={picked.includes(t.id)} onChange={(e) => setPicked((x) => (e.target.checked ? [...x, t.id] : x.filter((y) => y !== t.id)))} />
                  <span className="font-code text-xs flex-1">{t.name}</span>{t.effect === "changes" && <Badge tone="degraded">changes data</Badge>}
                </label>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Permission"><Select value={scope} onChange={(e) => setScope(e.target.value as ToolScope)}><option value="reads">Read only</option><option value="changes" disabled={!hasChanging}>Read and change</option></Select></Field>
            <Field label="Calls per minute" hint={`At most ${server.ratePerMinute}.`}><Input type="number" min={1} max={server.ratePerMinute} value={rate} onChange={(e) => setRate(Number(e.target.value) || 0)} /></Field>
            <Field label="Access lasts"><Select value={String(exp)} onChange={(e) => setExp(e.target.value === "null" ? null : Number(e.target.value))}>{EXPIRY.map((x) => <option key={String(x.v)} value={String(x.v)}>{x.label}</option>)}</Select></Field>
          </div>
          <Field label="Why is this needed?" hint="Kept in the audit record."><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Support assistant needs order lookups" /></Field>
        </div>
      </Modal>

      <Modal open={!!secret} onClose={() => setSecret(null)} title="Copy the key now" footer={<Button variant="primary" onClick={() => setSecret(null)}>I have stored it</Button>}>
        <div className="space-y-3">
          <Notice tone="warn" title="This is the only time the key is shown">The platform keeps only its first characters, so it cannot be shown again. If it is lost, rotate it. {isLive ? "" : "This is a sample key and is not valid against a real server."}</Notice>
          <p className="text-[13px] text-text-secondary">Key for <span className="font-medium text-text-primary">{secret?.label}</span></p>
          <CodeBlock code={secret?.key ?? ""} language="text" title="MCP key" maxHeight={80} />
        </div>
      </Modal>

      <Confirm open={!!revoke} onClose={() => setRevoke(null)} danger title={`Revoke access for ${revoke?.principal.label}`} confirmLabel="Revoke"
        body="The caller is refused on its next call. A key issued for it stops working at once. You can grant access again later."
        onConfirm={async () => { if (revoke) { const r = await mcpAccess.revoke(server, revoke.id); r.ok ? toast("Access revoked") : toast(r.error, "error"); } setRevoke(null); }} />
    </div>
  );
}
