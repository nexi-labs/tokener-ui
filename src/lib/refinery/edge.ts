/**
 * Edge runners. A runner pool you host (Docker, VM or Kubernetes) can sit in a plant where the link to the cloud is slow, intermittent or absent.
 * This module holds the profile that says how connected such a pool is, checks which pipelines can run there under that profile, and writes the
 * deployment bundle (Compose file, runner configuration, readme) for the people who install it.
 *
 * Scope today: the profile, the pipeline check and the bundle. The runner's edge mode itself (the local buffer that holds outputs until the link
 * returns, and the sync) is not built, and the runner image is not published, so the bundle is the configuration that mode will read. Nothing here
 * has been run on an edge device.
 */
import { CONNECTOR_BY_ID } from "./connectors";
import { STEP_BY_OP } from "./steps";
import type { Connection, Dataset, Recipe, RunnerPool } from "./types";
import { pushSetting } from "./settingsBus";
import { zip } from "../zip";

export type Connectivity = "online" | "intermittent" | "offline-first";
export const CONNECTIVITY: { id: Connectivity; label: string; blurb: string }[] = [
  { id: "online", label: "Always connected", blurb: "A stable link to tok∑ner. Behaves like any other pool." },
  { id: "intermittent", label: "Intermittent link", blurb: "The link drops for minutes or hours. Work that needs the platform waits for it. Outputs are held locally and sent when it returns." },
  { id: "offline-first", label: "Offline first", blurb: "Runs inside the plant network with no internet. Only work that needs nothing outside runs. Outputs are held locally and synchronised in a window you set." },
];
export type EdgePlatform = "docker" | "industrial-edge";
export const PLATFORMS: { id: EdgePlatform; label: string; blurb: string }[] = [
  { id: "docker", label: "Docker or Kubernetes host", blurb: "A Compose file for any Linux host with Docker." },
  { id: "industrial-edge", label: "Siemens Industrial Edge", blurb: "A Compose file written to the Industrial Edge App Publisher's rules, with notes for publishing it to a device." },
];
export type EdgeProfile = { platform?: EdgePlatform; connectivity: Connectivity; bufferGb: number; retentionDays: number; syncEveryMinutes: number; syncMetrics: boolean };
export const DEFAULT_EDGE: EdgeProfile = { platform: "docker", connectivity: "offline-first", bufferGb: 50, retentionDays: 14, syncEveryMinutes: 15, syncMetrics: true };

/** Connectors whose systems live on the internet. Everything else is assumed to be reachable from the network the runner sits in. */
export function needsInternet(connectorId: string): boolean {
  const c = CONNECTOR_BY_ID.get(connectorId); if (!c) return false;
  return (c.group === "Object storage" && c.id !== "minio") || c.group === "Warehouses and lakehouses" || c.messaging?.family === "cloud-log";
}

export type PipelineFit = { recipe: string; fit: "runs" | "waits" | "blocked"; reasons: string[] };
/** Which pipelines assigned to the pool can run under the profile, and why not. */
export function checkPipelines(pool: RunnerPool, p: EdgeProfile, recipes: Recipe[], datasets: Dataset[], connections: Connection[]): PipelineFit[] {
  return recipes.filter((r) => r.pool === pool.name).map((r) => {
    const reasons: string[] = []; let needs = false;
    const ds = datasets.find((d) => d.id === r.inputDatasetId);
    const ai = r.steps.filter((s) => STEP_BY_OP.get(s.op)?.ai);
    if (ai.length) { needs = true; reasons.push(`${ai.length} step${ai.length === 1 ? " calls" : "s call"} a model through the gateway (${ai.map((s) => STEP_BY_OP.get(s.op)?.label ?? s.op).join(", ")}).`); }
    if (ds?.source.kind === "connection" || ds?.source.kind === "query") {
      const conn = connections.find((c) => c.id === (ds.source as { connectionId: string }).connectionId);
      if (conn && needsInternet(conn.connector)) { needs = true; reasons.push(`Reads ${ds.name} from ${CONNECTOR_BY_ID.get(conn.connector)?.name ?? conn.connector}, which is reached over the internet.`); }
    } else if (ds?.source.kind === "upload") { needs = true; reasons.push(`${ds.name} is an uploaded file held by tok∑ner, so the runner has to fetch it.`); }
    const sends = r.outputs.length > 0;
    let fit: PipelineFit["fit"] = "runs";
    if (p.connectivity === "online") { fit = "runs"; }
    else if (needs) fit = p.connectivity === "intermittent" ? "waits" : "blocked";
    if (p.connectivity !== "online" && sends && fit !== "blocked") reasons.push(`${r.outputs.length} output${r.outputs.length === 1 ? " is" : "s are"} held in the local buffer and sent when the link is up.`);
    if (!reasons.length) reasons.push("Reads from and writes to systems the runner can reach itself.");
    return { recipe: r.name, fit, reasons };
  });
}

export type EdgeFile = { name: string; language: "yaml" | "json" | "markdown" | "text"; content: string };
const slug = (s: string) => s.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();

/** The files to install a pool as an edge runner. The enrolment token is read from the environment and is never written into a file. */
export function edgeBundle(pool: RunnerPool, p: EdgeProfile): EdgeFile[] {
  return p.platform === "industrial-edge" ? industrialEdgeBundle(pool, p) : dockerBundle(pool, p);
}

/**
 * The same runner packaged as a Siemens Industrial Edge app. The Industrial Edge App Publisher imports a Docker Compose file of version 2.x
 * (2.0 to 2.4) and needs a memory limit on every service, so the file uses version 2.4 with mem_limit and cpus in place of deploy.resources,
 * which that version does not have. Reverse proxy, storage and network settings are made in the Publisher, not in the file. Not published to
 * an Industrial Edge Management system or run on a device from here.
 */
function industrialEdgeBundle(pool: RunnerPool, p: EdgeProfile): EdgeFile[] {
  const name = slug(pool.name); const base = dockerBundle(pool, p);
  const compose = `# Refinery runner for the pool ${pool.name}, as an Industrial Edge app.
# Import this file in the Industrial Edge App Publisher (Standalone Applications, Import YAML).
version: "2.4"
services:
  refinery-runner:
    image: \${REFINERY_RUNNER_IMAGE}
    container_name: refinery-runner-${name}
    restart: unless-stopped
    mem_limit: ${pool.memGbPerWorker}g
    cpus: ${pool.coresPerWorker}
    environment:
      REFINERY_POOL: ${pool.name}
      REFINERY_ENROLLMENT_TOKEN: \${REFINERY_ENROLLMENT_TOKEN}
      REFINERY_EDGE_CONFIG: /etc/refinery/runner.edge.json
    volumes:
      - ./runner.edge.json:/etc/refinery/runner.edge.json:ro
      - refinery-buffer:/var/lib/refinery/buffer
    healthcheck:
      test: ["CMD", "refinery-runner", "health"]
      interval: 30s
      timeout: 5s
      retries: 3
volumes:
  refinery-buffer: {}
`;
  const readme = `# Industrial Edge app: ${pool.name}

Connectivity: ${CONNECTIVITY.find((c) => c.id === p.connectivity)!.label}. ${CONNECTIVITY.find((c) => c.id === p.connectivity)!.blurb}

## Publish to a device

1. In the Industrial Edge App Publisher, create a standalone application and choose Import YAML with \`docker-compose.yml\`.
2. Replace the two placeholders in the file, or set them as environment variables of the service in the Publisher: the runner image and the enrolment token. Do not leave the token in a file you keep or share.
3. Review and choose Validate and Create. The Publisher needs a memory limit on the service, and the file sets ${pool.memGbPerWorker} GB.
4. In the Publisher's storage settings, keep \`refinery-buffer\` as a persistent volume. It holds outputs until they are sent, up to ${p.bufferGb} GB, so check that the device has the space.
5. The runner makes outbound connections only, so no reverse proxy entry is needed for it.
6. Upload the app version to Industrial Edge Management and install it on the device from there.

## Reading plant data

Add a connection in tok∑ner for each source the runner should read, such as an MQTT broker or an OPC UA server, using the address and credentials your device shows for it (the Databus Configurator for the device's own broker). Secrets stay as references.

## Settings

Local buffer ${p.bufferGb} GB, unsent output kept ${p.retentionDays} days, sync every ${p.syncEveryMinutes} minutes, run metrics ${p.syncMetrics ? "sent" : "not sent"}. The meaning of each is in the Docker bundle's readme, which has the same settings.

## Not yet verified

- The runner image and the runner's edge mode are in development, so nothing in this folder has run on an Industrial Edge device.
- The file follows the Publisher's published rules for Compose version, memory limits and storage. It has not been imported into a Publisher or uploaded to an Industrial Edge Management system from here, and the Publisher may change a file on import (for example, it removes build sections).
- Whether your Publisher version fills \${NAME} variables is not confirmed. If it does not, enter the values in the Publisher's environment settings.
`;
  return [
    { name: "docker-compose.yml", language: "yaml", content: compose },
    base.find((f) => f.name === "runner.edge.json")!,
    base.find((f) => f.name === ".env.example")!,
    { name: "README.md", language: "markdown", content: readme },
  ];
}

function dockerBundle(pool: RunnerPool, p: EdgeProfile): EdgeFile[] {
  const name = slug(pool.name); const bufferBytes = Math.round(p.bufferGb * 1024 ** 3);
  const compose = `# Edge runner for the pool ${pool.name}.
# Fill in .env (see .env.example), then: docker compose up -d
services:
  refinery-runner:
    image: \${REFINERY_RUNNER_IMAGE:?set REFINERY_RUNNER_IMAGE in .env}
    container_name: refinery-runner-${name}
    restart: unless-stopped
    environment:
      REFINERY_POOL: ${pool.name}
      REFINERY_ENROLLMENT_TOKEN: \${REFINERY_ENROLLMENT_TOKEN:?set REFINERY_ENROLLMENT_TOKEN in .env}
      REFINERY_EDGE_CONFIG: /etc/refinery/runner.edge.json
    volumes:
      - ./runner.edge.json:/etc/refinery/runner.edge.json:ro
      - refinery-buffer:/var/lib/refinery/buffer
    deploy:
      resources:
        limits:
          cpus: "${pool.coresPerWorker}"
          memory: ${pool.memGbPerWorker}g
    healthcheck:
      test: ["CMD", "refinery-runner", "health"]
      interval: 30s
      timeout: 5s
      retries: 3
volumes:
  refinery-buffer: {}
`;
  const config = JSON.stringify({
    pool: pool.name, mode: "edge", connectivity: p.connectivity,
    buffer: { path: "/var/lib/refinery/buffer", maxBytes: bufferBytes, retentionDays: p.retentionDays, whenFull: "pause-intake" },
    sync: { everyMinutes: p.syncEveryMinutes, sendRunMetrics: p.syncMetrics, order: "oldest-first", resumeAfterFailure: true },
    offline: { allowModelSteps: p.connectivity === "online", allowInternetSources: p.connectivity === "online" },
    secrets: { source: "environment", enrolmentToken: "REFINERY_ENROLLMENT_TOKEN" },
  }, null, 2) + "\n";
  const env = `# Copy to .env. Keep this file out of version control.\nREFINERY_RUNNER_IMAGE=<runner-image>\nREFINERY_ENROLLMENT_TOKEN=<the token shown once when the pool was created>\n`;
  const readme = `# Edge runner: ${pool.name}

Connectivity: ${CONNECTIVITY.find((c) => c.id === p.connectivity)!.label}. ${CONNECTIVITY.find((c) => c.id === p.connectivity)!.blurb}

## Install

1. Copy this folder to the edge host. Docker with the Compose plugin is required.
2. Copy \`.env.example\` to \`.env\` and fill in the runner image and the enrolment token.
3. Run \`docker compose up -d\`.
4. In tok∑ner, open Refinery, Runners and check that the pool shows as online.

## What the settings mean

| Setting | Value | Meaning |
| --- | --- | --- |
| Local buffer | ${p.bufferGb} GB | Outputs wait here until they are sent. When it is full the runner stops taking new work instead of dropping data. |
| Retention | ${p.retentionDays} days | How long unsent output is kept before the runner reports it as lost. |
| Sync | every ${p.syncEveryMinutes} minutes | How often the runner tries to send buffered output, oldest first, and resumes after a failure. |
| Run metrics | ${p.syncMetrics ? "sent" : "not sent"} | Counts and timings that tok∑ner shows on the run page. |

## Notes

- The enrolment token is read from the environment. It is not written into any file in this folder.
- Model steps and sources on the internet are ${p.connectivity === "online" ? "allowed" : "not run while the link is down"}.
- The runner's edge mode and the runner image are in development. This folder is the configuration that mode reads. It has not been run on an edge device.
`;
  return [
    { name: "docker-compose.yml", language: "yaml", content: compose },
    { name: "runner.edge.json", language: "json", content: config },
    { name: ".env.example", language: "text", content: env },
    { name: "README.md", language: "markdown", content: readme },
  ];
}

export async function bundleZip(pool: RunnerPool, p: EdgeProfile): Promise<Blob> {
  const dir = `${p.platform === "industrial-edge" ? "industrial-edge-app" : "edge-runner"}-${slug(pool.name)}`;
  const bytes = zip(edgeBundle(pool, p).map((f) => ({ path: `${dir}/${f.name}`, content: f.content })));
  return new Blob([bytes as BlobPart], { type: "application/zip" });
}

export const edgeKey = (id: string) => `tok.refinery.edge.${id}`;
const key = edgeKey;
export function loadEdge(poolId: string): EdgeProfile {
  try { const raw = localStorage.getItem(key(poolId)); if (raw) return { ...DEFAULT_EDGE, ...(JSON.parse(raw) as Partial<EdgeProfile>) }; } catch { /* use the default */ }
  return DEFAULT_EDGE;
}
export function saveEdge(poolId: string, p: EdgeProfile): void { try { localStorage.setItem(key(poolId), JSON.stringify(p)); } catch { /* storage unavailable */ } pushSetting("pools", poolId, "edge", p); }
