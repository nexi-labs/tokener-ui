/**
 * Runs the console's mapping of a deployment over JSON the Java service actually produced (DeployChecks), so the two cannot drift.
 * From the repository root: bash scripts/deploy_contract_check.sh
 */
import { readFileSync } from "node:fs";
import { toDeployment } from "../src/lib/mlops/live/mappers";

const j = JSON.parse(readFileSync(process.argv[2], "utf8"));
let pass = 0, fail = 0;
const ok = (c: boolean, what: string) => { if (c) pass++; else { fail++; console.log("FAIL", what); } };

const d = toDeployment(j);
ok(d.name === "llama-dev" && d.modelId === "llama8" && d.version === 1 && d.env === "development", "identity, model and environment");
ok(d.health === "progressing" && d.rollout.state === "in-progress" && d.rollout.strategy === "rolling", "health and rollout");
ok(d.replicas.min >= 0 && d.replicas.max >= d.replicas.min && d.replicas.desired >= 1, "replicas");
ok(d.resources.gpu === "1", "GPUs per replica");
ok(d.traffic.stable === 100 && d.traffic.canary === 0, "all traffic on the stable version");
ok(d.accelerator?.engine === "vllm" && d.accelerator.count === 1 && /h100/i.test(d.accelerator.gpu) && d.accelerator.cuda.length > 0, "the accelerator: engine, GPU, count and CUDA toolkit");
ok(typeof d.accelerator?.driver === "string" && d.accelerator.driver.length > 0, "and the node driver");
ok(d.exposure?.providerId === "llama-dev" && d.exposure.mcpServerId === undefined && d.exposure.mcpTool === undefined, "what it is exposed as");
ok(!JSON.stringify(d).includes("null"), "no nulls leak into the console's model");
ok(Date.parse(d.createdAt) > 0 && d.demo === false, "times and the sample flag");

console.log(`${pass} checks passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
