import { OP_BY_KIND } from "./operators";
import { toYaml, topoOrder, type PipelineSpec, type SpecNode } from "./spec";
import type { Connection } from "./types";

export type PlanStep = {
  nodeId: string;
  name: string;
  operator: string;
  action: string;
  target: string;
  effect: "read" | "create" | "update" | "delete" | "wait" | "none";
  risk: "low" | "medium" | "high";
  confirm: boolean;
  cost?: string;
  adapter: string;
  runnable: boolean;
};

export type Manifest = { id: string; nodeId: string; title: string; language: "yaml" | "bash" | "json"; content: string; note: string };

const EFFECT: Record<string, PlanStep["effect"]> = {
  git_source: "read", registry_model: "read", build_image: "create", validate_artifact: "none", evaluate_model: "create", approval_gate: "wait",
  register_model: "create", data_source: "read", preprocess: "create", train: "create", deploy_endpoint: "update", canary_rollout: "update",
  verify_endpoint: "read", promote: "update", rollback: "update", ingest_documents: "read", stream_source: "read", store_documents: "create",
  chunk_embed: "create", vector_index: "update", retrieve: "read", agent_service: "create", monitor: "create", notify: "none", cleanup: "delete",
  schedule_trigger: "none", interval_timer: "none", wait_delay: "wait", time_window: "wait", calendar_read: "read", calendar_event: "create", email_inbox: "read", llm_step: "none", send_email: "create", send_sms: "create", mcp_tool: "update", mcp_resource: "read", payment_request: "none", pay_mtn_momo: "create", pay_orange_money: "create", pay_paypal: "create", pay_card: "create", pay_bitcoin: "create", pay_custom: "create", await_payment: "wait", payment_refund: "update",
};

const num = (v: any, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const memGi = (m: any) => num(String(m ?? "").replace(/[^\d.]/g, ""), 1);

/** Order-of-magnitude estimate from list-price assumptions. Always labelled an estimate in the UI. */
export function estimateMonthlyCost(n: SpecNode): number | undefined {
  if (!["deploy_endpoint", "canary_rollout", "agent_service"].includes(n.operator)) return undefined;
  const replicas = Math.max(1, num(n.config.replicasMin, 1));
  const per = num(n.config.cpu, 1) * 0.035 + memGi(n.config.memory) * 0.005 + num(n.config.gpu) * 0.9;
  return Math.round(replicas * per * 730);
}

export function generatePlan(spec: PipelineSpec, connections: Connection[]): PlanStep[] {
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  return topoOrder(spec).map((id) => {
    const n = byId.get(id)!;
    const op = OP_BY_KIND[n.operator];
    const c = connections.find((x) => x.id === n.connection);
    const effect = EFFECT[n.operator] ?? "none";
    const cost = estimateMonthlyCost(n);
    const prod = spec.environment === "production";
    return {
      nodeId: n.id, name: n.name, operator: n.operator, adapter: op.adapter, runnable: op.executable !== "none",
      action: `${effect === "none" ? "Evaluate" : effect[0].toUpperCase() + effect.slice(1)}: ${op.label}`,
      target: c ? c.name : "control plane",
      effect,
      risk: op.destructive || (prod && (effect === "update" || effect === "delete")) ? "high" : effect === "update" || op.costly ? "medium" : "low",
      confirm: !!op.destructive || (prod && effect !== "read" && effect !== "none" && effect !== "wait"),
      cost: cost !== undefined ? `about $${cost.toLocaleString("en-US")} per month at minimum replicas (estimate, not billed data)` : undefined,
    };
  });
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function generateManifests(spec: PipelineSpec, connections: Connection[]): Manifest[] {
  const out: Manifest[] = [];
  spec.nodes.forEach((n) => {
    const c = connections.find((x) => x.id === n.connection);
    const ns = "models";
    if (n.operator === "build_image") {
      out.push({
        id: `${n.id}-build`, nodeId: n.id, title: `${n.name}: build command`, language: "bash",
        note: "Runs on a matching build agent as an unprivileged user. Registry credentials come from the agent's secret store, not from this file.",
        content: [
          `docker buildx build \\`,
          `  --file ${n.config.dockerfile} \\`,
          `  --platform ${n.config.platforms} \\`,
          `  --provenance=${n.config.sign ? "mode=max" : "false"} --sbom=${n.config.sbom ? "true" : "false"} \\`,
          `  --tag ${n.config.repository}:<git-sha> \\`,
          `  --push .`,
        ].join("\n"),
      });
    }
    if (!["deploy_endpoint", "canary_rollout", "agent_service"].includes(n.operator) || !c) return;
    const name = slug(String(n.config.name ?? n.id));
    const image = `registry.nexi.example/ml/${name}@sha256:<resolved at build time>`;
    const res = { cpu: String(n.config.cpu ?? "1"), memory: String(n.config.memory ?? "2Gi") };
    const gpu = num(n.config.gpu);
    const labels = { "app.kubernetes.io/managed-by": "tokener", "tokener.io/pipeline": slug(spec.metadata.name), "tokener.io/environment": spec.environment };
    if (c.integrationId === "kserve") {
      const isc = {
        apiVersion: "serving.kserve.io/v1beta1", kind: "InferenceService",
        metadata: { name, namespace: ns, labels, annotations: { "serving.kserve.io/deploymentMode": "Serverless" } },
        spec: {
          predictor: {
            minReplicas: num(n.config.replicasMin, 1), maxReplicas: num(n.config.replicasMax, num(n.config.replicasMin, 1)),
            ...(n.operator === "canary_rollout" ? { canaryTrafficPercent: num(n.config.percent, 10) } : {}),
            containers: [{ name: "kserve-container", image, resources: { requests: res, limits: { ...res, ...(gpu ? { "nvidia.com/gpu": String(gpu) } : {}) } }, readinessProbe: { httpGet: { path: "/v2/health/ready", port: 8080 } } }],
          },
        },
      };
      out.push({ id: `${n.id}-isvc`, nodeId: n.id, title: `${n.name}: InferenceService`, language: "yaml", note: "Applied server-side with a dry run first. The image is pinned by digest at plan time.", content: toYaml(isc) });
    } else if (c.integrationId === "knative") {
      const svc = { apiVersion: "serving.knative.dev/v1", kind: "Service", metadata: { name, namespace: ns, labels }, spec: { template: { metadata: { annotations: { "autoscaling.knative.dev/min-scale": String(num(n.config.replicasMin, 0)), "autoscaling.knative.dev/max-scale": String(num(n.config.replicasMax, 5)) } }, spec: { containers: [{ image, resources: { requests: res } }] } } } };
      out.push({ id: `${n.id}-ksvc`, nodeId: n.id, title: `${n.name}: Knative Service`, language: "yaml", note: "Traffic splits are applied through revisions.", content: toYaml(svc) });
    } else if (["kubernetes", "custom-oci"].includes(c.integrationId)) {
      const dep = {
        apiVersion: "apps/v1", kind: "Deployment", metadata: { name, namespace: ns, labels },
        spec: {
          replicas: num(n.config.replicasMin, 1), selector: { matchLabels: { app: name } }, strategy: { type: "RollingUpdate", rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } },
          template: { metadata: { labels: { app: name, ...labels } }, spec: { containers: [{ name: "server", image, ports: [{ containerPort: 8080 }], resources: { requests: res, limits: { ...res, ...(gpu ? { "nvidia.com/gpu": String(gpu) } : {}) } }, readinessProbe: { httpGet: { path: "/healthz", port: 8080 }, periodSeconds: 5 }, livenessProbe: { httpGet: { path: "/healthz", port: 8080 }, periodSeconds: 15 }, envFrom: [{ secretRef: { name: `${name}-runtime` } }] }] } },
        },
      };
      const hpa = { apiVersion: "autoscaling/v2", kind: "HorizontalPodAutoscaler", metadata: { name, namespace: ns }, spec: { scaleTargetRef: { apiVersion: "apps/v1", kind: "Deployment", name }, minReplicas: num(n.config.replicasMin, 1), maxReplicas: num(n.config.replicasMax, num(n.config.replicasMin, 1)), metrics: [{ type: "Resource", resource: { name: "cpu", target: { type: "Utilization", averageUtilization: 70 } } }] } };
      const svc = { apiVersion: "v1", kind: "Service", metadata: { name, namespace: ns, labels }, spec: { selector: { app: name }, ports: [{ port: 80, targetPort: 8080 }] } };
      out.push({ id: `${n.id}-k8s`, nodeId: n.id, title: `${n.name}: Deployment, Service, HPA`, language: "yaml", note: "The runtime Secret is referenced by name. Its values are never part of this manifest.", content: [toYaml(dep), "---", toYaml(svc), "---", toYaml(hpa)].join("\n") });
    } else if (["linux-agent", "docker-local"].includes(c.integrationId)) {
      out.push({
        id: `${n.id}-docker`, nodeId: n.id, title: `${n.name}: container run (agent)`, language: "bash",
        note: "Executed by the agent as an unprivileged user from its allowlist. Not available for production by default.",
        content: [`docker run -d --name ${name} \\`, `  --restart unless-stopped \\`, `  --cpus ${res.cpu} --memory ${res.memory.replace("Gi", "g")} \\`, ...(gpu ? [`  --gpus ${gpu} \\`] : []), `  -p 8080:8080 \\`, `  --env-file /etc/tokener/${name}.env \\`, `  ${image}`].join("\n"),
      });
    }
  });
  out.push({ id: "spec", nodeId: "", title: "Pipeline spec (redacted)", language: "yaml", note: "The canonical document both the builder and the wizard edit.", content: "" });
  return out;
}
