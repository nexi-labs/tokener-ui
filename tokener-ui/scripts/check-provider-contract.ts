/**
 * Runs the console's mapping of provider API answers against JSON the Java API actually produced (ContractDump), so the two cannot drift.
 * From the repository root: CONTRACT_OUT=/tmp/contract.json bash scripts/provider_core_check.sh ContractDump
 * then, from tokener-ui: npx tsx scripts/check-provider-contract.ts /tmp/contract.json
 */
import { readFileSync } from "node:fs";
import { toProvider, toTestOutcome, type ServerDetail, type ServerRegistered, type ServerTested } from "../src/lib/gateway/provider-live";
import { SPECS } from "../src/lib/gateway/provider-catalog";

const d = JSON.parse(readFileSync(process.argv[2], "utf8")) as { registered: ServerRegistered; unchecked: ServerRegistered; tested: ServerTested; list: ServerDetail[]; specCount: number };
let pass = 0, fail = 0;
const ok = (c: boolean, what: string) => { if (c) pass++; else { fail++; console.log("FAIL", what); } };

ok(d.specCount === SPECS.length, `the catalogues have the same number of providers (${d.specCount} vs ${SPECS.length})`);

const r = toProvider(d.registered.provider);
ok(r.id === "openai-primary" && r.name === "OpenAI (primary)" && r.kind === "OpenAI", "identity");
ok(r.status === "healthy" && r.priority === 1 && r.region === "us-east", "status, priority, region");
ok(r.models.join() === "gpt-5,gpt-5-mini" && r.rpmLimit === 1000 && r.tpmLimit === 400000, "models and limits");
ok(r.p50 === 40 && r.fresh === true, "latency comes from the test and no traffic figure is invented");
ok(r.secretRefs.length === 1 && r.secretRefs[0].startsWith("secretref://vault/") && r.secretRef === r.secretRefs[0], "secret references");
ok(r.icon !== null, "the brand icon is found from specId");
ok(r.note === "Primary account", "the note is kept");
ok(!JSON.stringify(r).includes("sk-first"), "no key value");

const o = toTestOutcome(d.registered.outcome);
ok(o.ok && o.verified === true && o.steps.length === 4 && o.steps.map((s) => s.id).join() === "reach,auth,models,completion", "four steps in order");
ok(o.models.length === 3 && o.models[0].id === "gpt-5", "models found by the test");
ok(/^\d\d:\d\d:\d\d$/.test(o.ranAt), `the time is shown as a clock time (${o.ranAt})`);

const u = toProvider(d.unchecked.provider);
ok(u.status === "degraded" && !!u.note?.startsWith("No test has passed yet"), "an unchecked provider is degraded and says why");
ok(u.kind === "Bedrock" && u.secretRefs.length === 1, "bedrock keeps only the external id as a secret");
const uo = toTestOutcome(d.unchecked.outcome, SPECS.find((s) => s.id === "bedrock"));
ok(!uo.ok && uo.verified === false, "it is reported as not verified");
ok(uo.models.length > 0 && uo.models.every((m) => typeof m.id === "string"), "the catalogue's suggestions stand in for the model list");
ok(uo.steps.every((s) => !s.ok), "no step claims to have passed");

const t = toProvider(d.tested.provider);
ok(t.status === "degraded", "a provider whose test now fails is degraded");
const to = toTestOutcome(d.tested.outcome);
ok(!to.ok && to.steps.some((s) => !s.ok && s.detail.length > 0), "and the failing step says what went wrong");

ok(d.list.map(toProvider).length === 2, "the list maps");
console.log(`${pass} checks passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
