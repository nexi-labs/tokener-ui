import { isSafeIcon } from "@/lib/icons/collection";
import { validateContract, type Contract, type Problem } from "@/lib/mlops/contract";
import { AUTH_LABEL, CAPABILITY_LABEL, FAMILY_LABEL, type AuthMode, type CapabilityId, type CapabilitySupport, type FieldDef, type Family, type IntegrationDef } from "@/lib/mlops/types";

/** Everything a platform admin must get right before a connector can be published, as plain sentences. The server applies the same rules. */

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
export const ID_RULE = /^[a-z][a-z0-9-]{2,39}$/;
export const FIELD_KEY = /^[A-Za-z][A-Za-z0-9]{0,39}$/;
/** A field that looks like a secret must be a reference, so a value can never be typed into a connection form. */
const SECRETISH = /(secret|password|passwd|apikey|api_key|privatekey|credential)|token$/i;

export const FAMILIES = Object.keys(FAMILY_LABEL) as Family[];
export const AUTH_MODES = Object.keys(AUTH_LABEL) as AuthMode[];
export const CAPABILITIES = Object.keys(CAPABILITY_LABEL) as CapabilityId[];

export const lines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

export function blankConnector(): IntegrationDef {
  return {
    id: "", name: "", vendor: "", family: "infrastructure", icon: { ref: "glyph-plug" }, status: "planned",
    blurb: "", versionTarget: "", auth: ["api-token"], prerequisites: [], capabilities: [{ id: "validate", level: "full" }, { id: "discover", level: "full" }], limitations: [],
    permissions: { read: [], write: [] }, compliance: [], fields: [{ key: "endpoint", label: "Endpoint", type: "text", placeholder: "https://api.example.com", required: true }], docs: [],
    contract: starterContract("rest"),
  };
}

export type Starter = "rest" | "health";
export function starterContract(kind: Starter): Contract {
  if (kind === "health") return { version: "1", auth: { mode: "none" }, test: [{ name: "Reach the server", request: { method: "GET", path: "/health" }, expect: { status: [200] }, example: { status: 200, json: { status: "ok" } } }] };
  return {
    version: "1", timeoutSec: 20, auth: { mode: "bearer" },
    test: [{ name: "Reach the API and read the account", request: { method: "GET", path: "/v1/me" }, expect: { status: [200] }, example: { status: 200, json: { id: "acct_1", name: "Example" } } }],
    discover: [{ kind: "projects", request: { method: "GET", path: "/v1/projects" }, items: "$.data", name: "$.name", example: { status: 200, json: { data: [{ name: "alpha" }, { name: "beta" }] } } }],
  };
}

export type DefProblem = { step: number; path: string; message: string };

/** The wizard steps, so a problem can say where to go to fix it. */
export const STEPS = ["Identity", "Connection form", "Capabilities", "Contract", "Try it", "Review and publish"] as const;

export function validateDefinition(d: IntegrationDef, taken: { id: string; source: "built-in" | "published" }[], editing: boolean): DefProblem[] {
  const out: DefProblem[] = [];
  const add = (step: number, path: string, message: string) => out.push({ step, path, message });

  if (!ID_RULE.test(d.id)) add(0, "id", "The identifier must be 3 to 40 characters: lowercase letters, digits and dashes, starting with a letter.");
  else if (!editing && taken.some((t) => t.id === d.id)) add(0, "id", `The identifier ${d.id} is already used by a ${taken.find((t) => t.id === d.id)!.source} connector.`);
  if (d.name.trim().length < 3) add(0, "name", "Give the connector a name of at least 3 characters.");
  if (d.vendor.trim().length < 2) add(0, "vendor", "Name the vendor or project.");
  if (d.blurb.trim().length < 20) add(0, "blurb", "Describe what the connector does in a sentence of at least 20 characters.");
  if (!d.versionTarget.trim()) add(0, "versionTarget", "Say which versions it works with. The platform still checks the real version at connect time.");
  if (!isSafeIcon(d.icon)) add(0, "icon", "Choose an icon from the collection, or upload an SVG.");
  d.docs.forEach((x, i) => { if (!/^https:\/\/[^\s]+$/.test(x.url) || !x.label.trim()) add(0, `docs[${i}]`, "Each documentation link needs a label and an https address."); });

  if (d.auth.length === 0) add(1, "auth", "Choose at least one way to authenticate.");
  const seen = new Set<string>();
  d.fields.forEach((f: FieldDef, i) => {
    if (!FIELD_KEY.test(f.key)) add(1, `fields[${i}]`, `The field key ${f.key || "(empty)"} must be letters and digits, starting with a letter.`);
    if (["auth", "tlsVerify", "name", "env"].includes(f.key) && f.key !== "tlsVerify") add(1, `fields[${i}]`, `${f.key} is used by the connection form itself. Choose another key.`);
    if (seen.has(f.key)) add(1, `fields[${i}]`, `The field key ${f.key} is used twice.`); seen.add(f.key);
    if (!f.label.trim()) add(1, `fields[${i}]`, `The field ${f.key} needs a label.`);
    if (SECRETISH.test(f.key) && !/Ref$/.test(f.key)) add(1, `fields[${i}]`, `${f.key} looks like a secret. Name it ${f.key}Ref so connections keep a secret reference and never the value.`);
    if (f.type === "select" && (!f.options || f.options.length < 2)) add(1, `fields[${i}]`, `${f.label} is a choice and needs at least two options.`);
    if (f.showWhen && f.showWhen.key !== "auth" && !d.fields.some((x) => x.key === f.showWhen!.key)) add(1, `fields[${i}]`, `${f.label} is shown depending on ${f.showWhen.key}, which is not a field.`);
  });
  if (!d.fields.some((f) => f.key === "endpoint") && d.contract && d.contract.via === undefined) add(1, "fields", "A contract connector needs an endpoint field, so the platform knows where to send requests.");

  const caps = d.capabilities.filter((c: CapabilitySupport) => c.level !== "none");
  if (caps.length === 0) add(2, "capabilities", "Choose at least one capability the connector supports.");
  if (d.permissions.read.length === 0) add(2, "permissions.read", "List what read-only access needs, so people can grant the least privilege.");
  if (caps.some((c) => ["deploy", "scale", "canary", "rollback", "registry-write", "write-data", "send-mail", "write-calendar", "collect-payment", "refund", "send-sms"].includes(c.id)) && d.permissions.write.length === 0) add(2, "permissions.write", "The capabilities include changes. List the write permissions they need.");
  d.capabilities.forEach((c, i) => { if (c.level === "partial" && !(c.note ?? "").trim()) add(2, `capabilities[${i}]`, `Say what is partial about ${CAPABILITY_LABEL[c.id]}.`); });
  if (d.prerequisites.length === 0) add(2, "prerequisites", "List what someone needs before connecting, such as an account or a role.");

  if (d.contract) for (const p of validateContract(d.contract, d.capabilities)) add(3, p.path, p.message);
  else if (d.published?.hosting !== "remote") add(3, "contract", "Add a contract, or choose a remote connector service on the last step.");

  if (d.published?.hosting === "remote") {
    if (!/^https:\/\/[^\s/]+/.test(d.published.remoteUrl ?? "")) add(5, "remoteUrl", "Give the https address of the connector service.");
  }
  return out;
}

export function contractProblems(d: IntegrationDef): Problem[] { return d.contract ? validateContract(d.contract, d.capabilities) : []; }
