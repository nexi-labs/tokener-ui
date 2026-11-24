import { Container, Eyebrow, H2 } from "@/components/site/ui";
import { Code } from "@/components/site/CodeTabs";

export const metadata = { title: "API reference | tok∑ner" };

type Row = [string, string, string, "live" | "planned"];

const DATA: Row[] = [
  ["POST", "/v1/chat/completions", "Chat completions through the full gateway filter chain", "live"],
  ["POST", "/v1/responses", "Responses API", "planned"],
  ["POST", "/v1/embeddings", "Create embeddings", "planned"],
  ["POST", "/v1/images/generations", "Generate images", "planned"],
  ["POST", "/v1/audio/speech", "Text to speech", "planned"],
  ["POST", "/v1/audio/transcriptions", "Speech to text", "planned"],
  ["GET", "/v1/models", "List the model aliases available to the key", "planned"],
  ["GET", "/v1/ws", "WebSocket for realtime and voice traffic", "planned"],
];

const CONTROL: Row[] = [
  ["POST", "/api/v1/orgs", "Create an organization", "live"],
  ["POST", "/api/v1/orgs/{orgId}/tenants", "Create a tenant", "live"],
  ["GET", "/api/v1/orgs/{orgId}/tenants", "List tenants", "live"],
  ["POST", "/api/v1/tenants/{tenantId}/departments", "Create a department", "live"],
  ["POST", "/api/v1/departments/{departmentId}/projects", "Create a project", "live"],
  ["POST", "/api/v1/projects/{projectId}/applications", "Create an application and key", "live"],
  ["DELETE", "/api/v1/applications/{applicationId}", "Disable an application", "live"],
  ["POST", "/api/v1/providers", "Register a provider", "live"],
  ["GET", "/api/v1/providers", "List providers", "live"],
  ["POST", "/api/v1/providers/{providerId}/test-connection", "Test provider connectivity", "live"],
  ["POST", "/api/v1/models", "Register a model", "live"],
  ["POST", "/api/v1/models/{modelId}/providers", "Map a model to a provider", "live"],
  ["POST", "/api/v1/models/{modelId}/aliases", "Create an alias", "live"],
  ["POST", "/api/v1/models/{modelId}/pricing", "Add a pricing version", "live"],
  ["POST", "/api/v1/policies", "Create a policy", "live"],
  ["PUT", "/api/v1/policies/{policyId}", "Update a policy and bump its version", "live"],
  ["POST", "/api/v1/policies/simulate", "Simulate a policy", "live"],
  ["POST", "/api/v1/budgets", "Create a budget", "live"],
  ["GET", "/api/v1/budgets", "List budgets", "live"],
  ["POST", "/api/v1/quotas", "Create a quota", "live"],
  ["GET", "/api/v1/quotas", "List quotas", "live"],
  ["POST", "/api/v1/documents/upload", "Upload a document (multipart)", "live"],
  ["GET", "/api/v1/documents/{cadId}", "Fetch a Canonical AI Document", "live"],
  ["POST", "/api/v1/documents/policies", "Create a document policy", "live"],
  ["GET", "/api/v1/usage/events", "Query usage events", "live"],
  ["GET", "/api/v1/audit", "List audit entries", "live"],
  ["GET", "/api/v1/audit/export", "Export audit as CSV", "live"],
  ["GET", "/api/v1/cost/forecast", "Spend forecast", "live"],
  ["GET", "/api/v1/billing/orgs/{orgId}/invoices", "List invoices", "live"],
  ["GET", "/api/v1/billing/tenants/{tenantId}/chargeback", "Chargeback report", "live"],
  ["POST", "/api/v1/notifications/channels", "Create a notification channel", "live"],
  ["POST", "/api/v1/notifications/rules", "Create a notification rule", "live"],
  ["POST", "/api/v1/graphql", "Analytics aggregate queries", "planned"],
];

function Table({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm min-w-[640px]">
        <tbody>
          {rows.map(([m, p, d, st]) => (
            <tr key={m + p} className="border-b border-border last:border-0">
              <td className="px-4 py-3 w-24">
                <span className={`font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded ${m === "GET" ? "bg-status-info/10 text-status-info" : m === "DELETE" ? "bg-status-down/10 text-status-down" : "bg-accent-100 text-ink-800"}`}>{m}</span>
              </td>
              <td className="px-2 py-3 font-mono text-[13px] text-text-primary">{p}</td>
              <td className="px-4 py-3 text-text-secondary">{d}</td>
              <td className="px-4 py-3 text-right">
                <span className={`text-[11px] ${st === "live" ? "text-status-healthy" : "text-text-tertiary"}`}>{st === "live" ? "available" : "planned"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export default function ApiPage() {
  return (
    <Container className="py-14 sm:py-20 max-w-[960px]">
      <Eyebrow>API reference</Eyebrow>
      <H2>Two surfaces, one contract.</H2>
      <p className="text-text-secondary mt-4 leading-relaxed max-w-2xl">
        The data plane carries AI traffic and is OpenAI compatible. The control plane manages everything the console can do. Both are specified OpenAPI first, and the SDKs are generated from the same spec.
      </p>

      <h3 className="text-lg font-semibold text-text-primary mt-12 mb-4">Authentication</h3>
      <div className="grid md:grid-cols-2 gap-5 text-sm text-text-secondary">
        <div className="rounded-xl border border-border p-5"><div className="font-semibold text-text-primary mb-1">Data plane</div>Send <code className="font-mono text-[12px] bg-surface-muted px-1 rounded">Authorization: Bearer tok_...</code> with an application key, or a federated JWT for a service account.</div>
        <div className="rounded-xl border border-border p-5"><div className="font-semibold text-text-primary mb-1">Control plane</div>OIDC issued JWT from your identity provider, using the Authorization Code flow with PKCE for the console.</div>
      </div>

      <h3 className="text-lg font-semibold text-text-primary mt-12 mb-4">Data plane</h3>
      <Table rows={DATA} />

      <h3 className="text-lg font-semibold text-text-primary mt-12 mb-4">Control plane</h3>
      <Table rows={CONTROL} />

      <h3 className="text-lg font-semibold text-text-primary mt-12 mb-4">Versioning</h3>
      <p className="text-text-secondary leading-relaxed max-w-2xl">
        Versions live in the URL path. Breaking changes ship as a new version and the previous one stays supported for at least 12 months for data plane APIs. Additive changes, such as new optional fields, ship without a version bump.
      </p>

      <h3 className="text-lg font-semibold text-text-primary mt-12 mb-4">Example</h3>
      <Code lang="http">{`POST /api/v1/budgets
Content-Type: application/json

{
  "scope_type": "project",
  "scope_id": "0b6c2f6e-....",
  "metric": "cost",
  "limit_value": 5000,
  "currency": "USD",
  "period": "monthly",
  "on_breach": "block",
  "rollover": false
}`}</Code>
    </Container>
  );
}
