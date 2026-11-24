"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2, PlugZap } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Kpi, MetricChart, Notice } from "@/components/mlops/ui";
import { Back, HealthPill, ProviderMark, SampleTag, fmtInt, usd } from "@/components/gateway/bits";
import { MODELS, providerSeries } from "@/lib/gateway/data";
import { useProviders } from "@/lib/gateway/useProviders";
import { ProviderPlayground } from "@/components/gateway/ProviderPlayground";
import { Field, Input } from "@/components/ui/Form";
import { liveApi } from "@/lib/gateway/provider-live";
import { SPECS, type TestOutcome } from "@/lib/gateway/provider-catalog";
import { liveOrgId } from "@/lib/mlops/store";
import { ApiError } from "@/lib/api/client";

export default function ProviderDetail() {
  const { id } = useParams<{ id: string }>();
  const { all: PROVIDERS, ready, live, error, reload } = useProviders();
  const p = PROVIDERS.find((x) => x.id === id);
  const data = useMemo(() => (p && !p.fresh ? providerSeries(p) : []), [p]);
  const [test, setTest] = useState<null | { at: string; ms: number; ok: boolean }>(null);
  const [liveTest, setLiveTest] = useState<TestOutcome | null>(null);
  const [busy, setBusy] = useState<null | "test" | "rotate" | "toggle">(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [rotated, setRotated] = useState<TestOutcome | null>(null);
  const fail = (e: unknown) => setProblem(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "That did not work. Try again.");
  const runLive = () => { setBusy("test"); setProblem(null); liveApi.testStored(liveOrgId(), id).then((r) => { setLiveTest(r.outcome); reload(); }).catch(fail).finally(() => setBusy(null)); };
  const toggle = (on: boolean) => { setBusy("toggle"); setProblem(null); liveApi.setEnabled(liveOrgId(), id, on).then(() => reload()).catch(fail).finally(() => setBusy(null)); };
  const rotate = () => {
    const sent = Object.fromEntries(Object.entries(secrets).filter(([, v]) => v.trim()));
    setBusy("rotate"); setProblem(null); setRotated(null);
    liveApi.rotate(liveOrgId(), id, sent).then((r) => { setRotated(r.outcome); setSecrets({}); reload(); }).catch(fail).finally(() => setBusy(null));
  };
  if (!p && !ready) return null;
  if (!p && live && error) return <div className="p-8 text-sm text-text-secondary">The providers could not be loaded. {error} <Link className="underline" href="/providers">Back to providers</Link></div>;
  if (!p) return <div className="p-8 text-sm text-text-secondary">This provider does not exist. <Link className="underline" href="/providers">Back to providers</Link></div>;
  const served = MODELS.filter((m) => p.models.includes(m.id));
  const peers = PROVIDERS.filter((q) => q.id !== p.id && q.models.some((m) => p.models.includes(m))).sort((a, b) => a.priority - b.priority);
  return (
    <div className="space-y-5">
      <Back href="/providers" label="Providers" />
      <div className="flex items-start gap-4"><ProviderMark p={p} size={48} /><div className="flex-1 min-w-0"><PageHeader title={p.name} description={`${p.kind} in ${p.region}. Failover priority ${p.priority}.`} /></div><HealthPill s={p.status} /></div>
      <SampleTag />
      {problem && <Notice tone="bad" title="That did not work">{problem}</Notice>}
      {p.note && <Notice tone={p.status === "healthy" ? "info" : "warn"} title={p.status === "healthy" ? "Note" : "Needs attention"}>{p.note}</Notice>}
      {!p.fresh && (
        <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Latency p50 / p99" value={`${p.p50} / ${p.p99} ms`} sub="Last 24 hours" />
        <Kpi label="Error rate" value={`${p.errorRatePct}%`} sub="Failed or timed out" tone={p.errorRatePct > 1 ? "warn" : undefined} />
        <Kpi label="Requests per day" value={fmtInt(p.requestsPerDay)} sub={`${((p.requestsPerDay / PROVIDERS.reduce((s, x) => s + x.requestsPerDay, 0)) * 100).toFixed(0)}% of gateway traffic`} />
        <Kpi label="Spend per day" value={usd(p.spendPerDayUsd, 0)} sub={p.selfHosted ? "GPU time" : "Provider charges"} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card><CardHeader title="Latency" subtitle="Milliseconds, last 24 hours" /><CardBody><MetricChart data={data} series={[{ key: "p50", name: "p50" }, { key: "p99", name: "p99" }]} unit=" ms" /></CardBody></Card>
        <Card><CardHeader title="Error rate" subtitle="Percent of requests, last 24 hours" /><CardBody><MetricChart data={data} series={[{ key: "errors", name: "Errors" }]} unit="%" area /></CardBody></Card>
      </div>
        </>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Models served" subtitle="Tokens and requests to these models are routed here" />
          <div className="divide-y divide-border">
            {p.models.filter((id) => !served.some((m) => m.id === id)).map((id) => (
              <div key={id} className="flex items-center justify-between gap-3 px-5 py-3"><span className="font-mono text-sm font-medium">{id}</span><span className="text-xs text-text-tertiary">Enabled at registration</span></div>
            ))}
            {served.map((m) => (
              <Link key={m.id} href={`/models/${m.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-subtle">
                <span className="font-mono text-sm font-medium">{m.id}</span>
                <span className="text-xs text-text-tertiary">{m.capabilities.join(", ")} · {m.contextK >= 1000 ? `${m.contextK / 1000}M` : `${m.contextK}K`} context</span>
              </Link>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Failover" subtitle="Other providers for the same models" />
          <CardBody>
            {peers.length ? <ol className="space-y-2 text-[13px]">{peers.map((q) => <li key={q.id} className="flex items-center justify-between"><Link href={`/providers/${q.id}`} className="hover:underline">{q.name}</Link><Badge tone={q.status}>{q.status}</Badge></li>)}</ol>
              : <p className="text-[13px] text-text-secondary">No other provider serves these models. A failure here has no fallback.</p>}
          </CardBody>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Connection" subtitle="How the gateway reaches this provider" />
          <CardBody className="space-y-3 text-[13px]">
            {[["Credential", <code key="c" className="font-mono text-xs">{p.secretRef}</code>], ["Region", p.region], ["Request limit", `${fmtInt(p.rpmLimit)} per minute`], ["Token limit", `${fmtInt(p.tpmLimit)} per minute`]].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-4"><span className="text-text-tertiary">{k}</span><span className="text-text-primary text-right">{v}</span></div>
            ))}
            <p className="text-xs text-text-tertiary pt-1">The key is stored as a reference to your secret manager. tok&sum;ner never keeps the value.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Test connection" subtitle={live ? "Runs the four checks with the stored credential and records the result" : "Sends one small request and reports what came back"}
            action={live
              ? <Button variant="secondary" onClick={runLive} disabled={busy !== null}>{busy === "test" ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />} Run test</Button>
              : <Button variant="secondary" onClick={() => setTest({ at: new Date().toLocaleTimeString("en-GB"), ms: Math.round(p.p50 * (0.9 + Math.random() * 0.3)), ok: p.status !== "down" })}><PlugZap size={14} /> Run test</Button>} />
          <CardBody className="space-y-3">
            {live ? (liveTest ? (
              <>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {liveTest.steps.map((st) => (
                    <li key={st.id} className="flex items-start gap-3 px-4 py-2.5">
                      <span className={st.ok ? "text-status-healthy" : "text-status-down"} aria-hidden>{st.ok ? "\u2713" : "\u2715"}</span>
                      <div className="flex-1 min-w-0"><div className="text-[13px] font-medium text-text-primary">{st.label}</div><div className="text-xs text-text-secondary mt-0.5">{st.detail}</div></div>
                      {st.ok && <span className="text-xs text-text-tertiary tabular-nums">{st.ms} ms</span>}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-text-tertiary">Checked at {liveTest.ranAt}.</p>
              </>
            ) : <p className="text-[13px] text-text-secondary">No test run in this view yet. The status above is from the last test.</p>)
              : test ? <Notice tone={test.ok ? "ok" : "bad"} title={test.ok ? "Reachable" : "Failed"}>{test.ok ? `Answered in ${test.ms} ms at ${test.at}.` : `No answer at ${test.at}.`} This is a sample result; in a signed-in workspace the gateway makes the call.</Notice>
              : <p className="text-[13px] text-text-secondary">No test run yet.</p>}
          </CardBody>
        </Card>
      </div>
      {live && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <CardHeader title="Replace a credential" subtitle="The new value is tested first. The current one is replaced only if the test passes." />
            <CardBody className="space-y-4">
              {(SPECS.find((x) => x.id === (p as { specId?: string }).specId)?.fields.filter((f) => f.secret) ?? []).map((f) => (
                <Field key={f.key} label={f.label} hint="Leave empty to keep the current value.">
                  {f.multiline
                    ? <textarea value={secrets[f.key] ?? ""} onChange={(e) => setSecrets((x) => ({ ...x, [f.key]: e.target.value }))} rows={4} spellCheck={false} autoComplete="off" className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-600" />
                    : <Input type="password" autoComplete="off" spellCheck={false} value={secrets[f.key] ?? ""} onChange={(e) => setSecrets((x) => ({ ...x, [f.key]: e.target.value }))} placeholder={f.placeholder} />}
                </Field>
              ))}
              {rotated && <Notice tone="ok" title="The credential was replaced">The new value passed the test and is stored at the same reference.</Notice>}
              <div className="flex justify-end"><Button variant="primary" onClick={rotate} disabled={busy !== null || !Object.values(secrets).some((v) => v.trim())}>{busy === "rotate" ? <><Loader2 size={14} className="animate-spin" /> Testing</> : "Test and replace"}</Button></div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Routing" subtitle="Switch this provider in or out of the gateway's routing" />
            <CardBody className="space-y-3 text-[13px]">
              <p className="text-text-secondary">{p.note?.startsWith("Switched off") ? "It is switched off and receives no traffic. Its stored credentials are kept." : "It is part of routing. Switching it off sends traffic to the next provider in the failover order. Its stored credentials are kept."}</p>
              <div className="flex justify-end">
                {p.note?.startsWith("Switched off")
                  ? <Button variant="secondary" onClick={() => toggle(true)} disabled={busy !== null}>Switch on</Button>
                  : <Button variant="secondary" onClick={() => toggle(false)} disabled={busy !== null}>Switch off</Button>}
              </div>
            </CardBody>
          </Card>
        </div>
      )}
      <Card>
        <CardHeader title="Try it" subtitle="Send one prompt through the gateway, pinned to this provider" />
        <CardBody><ProviderPlayground providerId={p.id} models={p.models} /></CardBody>
      </Card>
    </div>
  );
}
