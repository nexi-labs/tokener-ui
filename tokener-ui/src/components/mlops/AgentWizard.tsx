"use client";

import clsx from "clsx";
import { Boxes, Check, Container, Loader2, Server } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { mlops, useMlops, useMlopsStatus } from "@/lib/mlops/store";
import { toast } from "@/lib/mlops/toast";
import { ENVS, ENV_LABEL, type BuildAgent, type Env } from "@/lib/mlops/types";
import { CodeBlock, Modal, Notice } from "./ui";

const STEPS = ["Where it runs", "Identity and scope", "Boundaries", "Install", "Verify"];
type Mode = BuildAgent["mode"];

const MODES: { id: Mode; title: string; icon: typeof Server; text: string; needs: string[] }[] = [
  { id: "linux-systemd", title: "Linux server", icon: Server, text: "A systemd service on a VM or bare-metal host, for example an on-prem GPU box.", needs: ["Linux x86_64 or arm64, systemd 245+", "Docker or Podman for image builds", "Outbound HTTPS only"] },
  { id: "kubernetes", title: "Kubernetes", icon: Boxes, text: "A Helm-installed agent that runs rootless build jobs as pods in a namespace you choose.", needs: ["Cluster access with Helm 3", "A dedicated namespace and quota", "Pod security: restricted"] },
  { id: "docker", title: "Docker host", icon: Container, text: "A single container on a developer machine or small server. Development use.", needs: ["Docker Engine 24+", "Outbound HTTPS only", "Not allowed for production by default"] },
];

export function AgentWizard({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (a: BuildAgent) => void }) {
  const s = useMlops();
  const live = useMlopsStatus().mode === "live";
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<Mode>("linux-systemd");
  const [name, setName] = useState("");
  const [env, setEnv] = useState<Env>("staging");
  const [arch, setArch] = useState("amd64");
  const [labels, setLabels] = useState("zone=onprem");
  const [registries, setRegistries] = useState(live ? "" : "registry.nexi.example");
  const [egress, setEgress] = useState(live ? "github.com:443, pypi.org:443" : "registry.nexi.example:443, github.com:443, pypi.org:443, tokener.io:443");
  const [sbom, setSbom] = useState(true);
  const [sign, setSign] = useState(true);
  const [gpu, setGpu] = useState(false);
  const [result, setResult] = useState<{ agent: BuildAgent; token: string } | null>(null);
  const [online, setOnline] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => { if (open) { setStep(0); setErr(""); setResult(null); setOnline(false); setName(""); } }, [open]);

  // A signed-in workspace waits for the real agent: look for its first heartbeat every few seconds while the last step is open.
  const enrolledId = result?.agent.id;
  const reported = live && enrolledId ? s?.agents.find((a) => a.id === enrolledId) : undefined;
  useEffect(() => {
    if (!live || step !== 4 || !enrolledId || online) return;
    setWaiting(true);
    const t = setInterval(() => { void mlops.refresh(["agents"]); }, 3000);
    return () => { clearInterval(t); setWaiting(false); };
  }, [live, step, enrolledId, online]);
  useEffect(() => {
    if (live && reported && reported.status !== "offline" && reported.lastHeartbeatAt) { setOnline(true); toast(`${reported.name} sent its first heartbeat`); }
  }, [live, reported]);

  if (!s) return null;

  const parseLabels = () => Object.fromEntries(labels.split(",").map((x) => x.trim()).filter(Boolean).map((x) => { const [k, ...v] = x.split("="); return [k.trim(), v.join("=").trim()]; }).filter(([k, v]) => k && v));
  const list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

  const next = async () => {
    setErr("");
    if (step === 1) {
      if (!/^[a-z][a-z0-9-]{2,40}$/.test(name)) return setErr("Name must be 3 to 41 lowercase letters, digits or hyphens, starting with a letter.");
      if (s.agents.some((a) => a.name === name)) return setErr(`An agent named ${name} already exists.`);
      if (env === "production" && !s.settings.allowProductionAgents) return setErr("Production agents are blocked by policy. An admin can allow them in Settings and access.");
      if (mode === "docker" && env === "production") return setErr("Docker host agents are not allowed for production.");
      if (!list(registries).length) return setErr("Allow at least one registry. The agent can only push to registries on this list.");
      if (list(egress).some((x) => /\*|0\.0\.0\.0|^\d+\.\d+\.\d+\.\d+\/0/.test(x))) return setErr("Wildcard egress is not allowed. List exact host:port entries.");
    }
    if (step === 2) {
      const r = await mlops.enrollAgent({ name, mode, env, arch, labels: { ...parseLabels(), ...(gpu ? { gpu: "detect" } : {}) }, egress: list(egress), registries: list(registries) });
      if (!r.ok) return setErr(r.error);
      setResult({ agent: r.agent, token: r.token });
      onCreated?.(r.agent);
    }
    setStep(step + 1);
  };

  const waitHeartbeat = () => {
    setWaiting(true);
    setTimeout(async () => { await mlops.simulateAgentHeartbeat(result!.agent.id); setWaiting(false); setOnline(true); toast(`${result!.agent.name} sent its first heartbeat (simulated)`); }, 1400);
  };

  const cmd = !result ? "" : mode === "linux-systemd"
    ? `# 1. Download the installer and verify it before running anything\ncurl -fsSLO https://get.tokener.io/agent/v0.4.0-preview/install-agent.sh\ncurl -fsSLO https://get.tokener.io/agent/v0.4.0-preview/install-agent.sh.sha256\nsha256sum -c install-agent.sh.sha256\n\n# 2. Read it, then run it. The token goes in a root-only file, not in shell history.\nsudo install -m 600 /dev/null /etc/tokener-agent.env\necho 'TOKENER_ENROLL_TOKEN=${result.token}' | sudo tee /etc/tokener-agent.env >/dev/null\nsudo sh ./install-agent.sh --name ${name} --env-file /etc/tokener-agent.env\n\n# 3. Check the service\nsystemctl status tokener-agent --no-pager`
    : mode === "kubernetes"
      ? `kubectl create namespace tokener-agent\nkubectl -n tokener-agent create secret generic tokener-agent-enroll \\\n  --from-literal=token='${result.token}'\n\nhelm install tokener-agent oci://registry.tokener.io/charts/agent \\\n  --version 0.4.0-preview \\\n  --namespace tokener-agent \\\n  --set agent.name=${name} \\\n  --set enrollment.existingSecret=tokener-agent-enroll \\\n  --set podSecurity=restricted\n\nkubectl -n tokener-agent rollout status deploy/tokener-agent`
      : `umask 077 && echo 'TOKENER_ENROLL_TOKEN=${result.token}' > ./tokener-agent.env\n\ndocker run -d --name tokener-agent --restart unless-stopped \\\n  --env-file ./tokener-agent.env \\\n  -e TOKENER_AGENT_NAME=${name} \\\n  -v /var/run/docker.sock:/var/run/docker.sock:ro \\\n  registry.tokener.io/agent:0.4.0-preview`;

  return (
    <Modal open={open} onClose={onClose} wide title={`Enroll build agent: step ${step + 1} of ${STEPS.length}, ${STEPS[step]}`}
      footer={
        step === 4 ? <Button variant="primary" onClick={onClose}>Done</Button> : (
          <>
            <Button onClick={onClose}>{step === 3 ? "Close" : "Cancel"}</Button>
            {step > 0 && step < 3 && <Button onClick={() => { setErr(""); setStep(step - 1); }}>Back</Button>}
            {step < 2 && <Button variant="primary" onClick={next}>Continue</Button>}
            {step === 2 && <Button variant="primary" onClick={next}>Create enrollment token</Button>}
            {step === 3 && <Button variant="primary" onClick={() => setStep(4)}>I have run the command</Button>}
          </>
        )
      }>
      <ol className="flex flex-wrap gap-1 mb-4" aria-label="Wizard progress">
        {STEPS.map((t, i) => (<li key={t} aria-current={i === step ? "step" : undefined} className={clsx("flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md", i === step ? "bg-emph text-on-emph" : i < step ? "text-text-secondary" : "text-text-tertiary")}><span className={clsx("h-4 w-4 rounded-full grid place-items-center text-[10px] font-semibold", i < step ? "bg-accent-600 text-ink-800" : i === step ? "bg-on-emph/20" : "border border-border-strong")}>{i < step ? <Check size={10} /> : i + 1}</span>{t}</li>))}
      </ol>
      {err && <div className="mb-3"><Notice tone="bad">{err}</Notice></div>}

      {step === 0 && (
        <div className="space-y-3">
          <p className="text-[13px] text-text-secondary">A build agent runs image builds on infrastructure you own. It connects out to the control plane, pulls jobs it is allowed to run, and never accepts inbound connections.</p>
          <div role="radiogroup" aria-label="Agent type" className="grid sm:grid-cols-3 gap-3">
            {MODES.map((m) => (
              <button key={m.id} role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)} className={clsx("text-left rounded-lg border p-3.5", mode === m.id ? "border-accent-600 bg-accent-50/50" : "border-border hover:bg-surface-subtle")}>
                <m.icon size={18} className="text-text-secondary" strokeWidth={1.75} /><div className="mt-2 text-[13px] font-semibold">{m.title}</div><p className="text-xs text-text-secondary mt-1">{m.text}</p>
                <ul className="mt-2 text-[11.5px] text-text-tertiary list-disc pl-4 space-y-0.5">{m.needs.map((n) => <li key={n}>{n}</li>)}</ul>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Agent name" hint="Lowercase, used in job routing and audit."><Input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="nexi-build-03" autoFocus /></Field>
          <Field label="Environment" hint="An agent serves one environment. Pipelines only route to agents in their own."><Select value={env} onChange={(e) => setEnv(e.target.value as Env)}>{ENVS.map((e) => <option key={e} value={e}>{ENV_LABEL[e]}</option>)}</Select></Field>
          <Field label="Architecture"><Select value={arch} onChange={(e) => setArch(e.target.value)}><option>amd64</option><option>arm64</option></Select></Field>
          <Field label="Labels" hint="key=value, comma separated. Pipelines match on these."><Input value={labels} onChange={(e) => setLabels(e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Registries the agent may push to" hint="Exact hostnames. Everything else is refused."><Input value={registries} onChange={(e) => setRegistries(e.target.value)} /></Field></div>
          <div className="sm:col-span-2"><Field label="Egress allowlist" hint="Exact host:port entries the agent may reach. No wildcards."><Input value={egress} onChange={(e) => setEgress(e.target.value)} /></Field></div>
          <div className="sm:col-span-2 divide-y divide-border">
            <Toggle checked={sbom} onChange={setSbom} label="Generate SBOM for every build" />
            <Toggle checked={sign} onChange={setSign} label="Sign images with the organization key" description="Policy can then block unsigned images from production." />
            <Toggle checked={gpu} onChange={setGpu} label="Report GPU inventory" description="Read-only detection of GPU model and driver version. No drivers are installed or changed." />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 text-[13px]">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-md border border-border p-3.5"><div className="font-semibold mb-1.5">The agent can</div><ul className="list-disc pl-4 space-y-1 text-text-secondary"><li>Pull allowlisted build jobs signed by the control plane</li><li>Build images as an unprivileged user in a work directory</li><li>Push to the {list(registries).length} registr{list(registries).length === 1 ? "y" : "ies"} you listed</li><li>Report status, logs (redacted) and host facts</li></ul></div>
            <div className="rounded-md border border-border p-3.5"><div className="font-semibold mb-1.5">The agent cannot</div><ul className="list-disc pl-4 space-y-1 text-text-secondary"><li>Accept inbound connections or open a shell for anyone</li><li>Run arbitrary commands outside its operation allowlist</li><li>Install or change GPU drivers, firmware or the kernel</li><li>Reach hosts outside the egress allowlist</li></ul></div>
          </div>
          <Notice tone="info" title="Enrollment token">The next step creates a one-time token. It is shown once, valid for 24 hours, exchanged for a short-lived credential on first contact, and stored by the control plane only as a hash.</Notice>
          <Notice tone="warn" title="GPU and host changes">Anything that changes host drivers or firmware needs a compatible agent capability and a separate explicit authorization. It is not part of this agent.</Notice>
        </div>
      )}

      {step === 3 && result && (
        <div className="space-y-4 text-[13px]">
          <Notice tone="warn" title="Copy the token now">It is displayed only here, once. If you lose it, create a new enrollment.</Notice>
          <div><div className="font-medium mb-1.5">Enrollment token</div><CodeBlock code={result.token} title="expires in 24 hours" maxHeight={60} /></div>
          <div><div className="font-medium mb-1.5">Install command</div><CodeBlock code={cmd} language={mode === "kubernetes" ? "shell" : "shell"} title={MODES.find((m) => m.id === mode)!.title} maxHeight={300} /></div>
          <Notice tone="info" title="Illustrative contract">No agent installer, chart or image is published yet. These commands show the intended install contract, including checksum verification and keeping the token out of shell history. The URLs are placeholders.</Notice>
        </div>
      )}

      {step === 4 && result && (
        <div className="space-y-4 text-[13px]">
          <p className="text-text-secondary">The agent contacts the control plane on first start, exchanges the token for a credential and starts sending heartbeats.</p>
          {!online ? (
            <div className="rounded-md border border-border p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">{waiting ? <Loader2 size={16} className="animate-spin text-text-secondary" /> : <span className="h-2 w-2 rounded-full bg-text-tertiary" />}<span>{waiting ? "Waiting for the first heartbeat" : `${result.agent.name} has not checked in yet`}</span></div>
              {!live && <Button variant="primary" disabled={waiting} onClick={waitHeartbeat}>Simulate first heartbeat</Button>}
            </div>
          ) : (
            <Notice tone="ok" title={live ? "Agent online" : "Agent online (simulated)"}>{result.agent.name} reported {(reported ?? result.agent).os}, {arch}{gpu ? ", GPU inventory enabled" : ""}, agent {(reported ?? result.agent).version}. It now appears in Build Agents and can take jobs from pipelines whose labels match.</Notice>
          )}
          <p className="text-xs text-text-tertiary">{live ? "This page checks every few seconds. A running agent sends a heartbeat on its own every 15 seconds." : "Send a test heartbeat to see the agent go online. A running agent sends this on its own every 15 seconds."}</p>
        </div>
      )}
    </Modal>
  );
}
