import { Container, Eyebrow, H2 } from "@/components/site/ui";
import { Code } from "@/components/site/CodeTabs";

export const metadata = { title: "Errors | tok∑ner" };

export default function ErrorsPage() {
  return (
    <Container className="py-14 sm:py-20 max-w-[860px]">
      <Eyebrow>Errors</Eyebrow>
      <H2>A typed contract, not a message to parse.</H2>
      <p className="text-text-secondary mt-4 leading-relaxed">
        Every REST surface returns the same envelope. The <code className="font-mono text-[12px] bg-surface-muted px-1 rounded">error.code</code> is part of the SDK contract and maps to a typed exception, so callers switch on a code instead of reading text.
      </p>
      <div className="mt-8"><Code lang="json">{`{
  "error": {
    "code": "budget_exceeded",
    "message": "Project 'recsys' monthly cost budget of 5000 USD has been exceeded.",
    "request_id": "01J...",
    "details": { "scope": "project:recsys", "limit": 5000, "current": 5012.34 }
  }
}`}</Code></div>

      <h3 className="text-lg font-semibold text-text-primary mt-12 mb-4">Blocked requests</h3>
      <div className="rounded-xl border border-border overflow-hidden text-sm">
        {[
          ["policy_denied", "A policy rule refused the request. details names the rule."],
          ["budget_exceeded", "A budget at the request scope is exhausted."],
          ["quota_exceeded", "A rate or volume quota was reached."],
        ].map(([c, d]) => (
          <div key={c} className="grid sm:grid-cols-[200px_1fr] gap-1 sm:gap-4 px-5 py-4 border-b border-border last:border-0">
            <code className="font-mono text-[13px] text-text-primary">{c}</code>
            <span className="text-text-secondary">{d}</span>
          </div>
        ))}
      </div>

      <h3 className="text-lg font-semibold text-text-primary mt-12 mb-4">Rate limit headers</h3>
      <p className="text-text-secondary leading-relaxed">
        Responses with status 429 include <code className="font-mono text-[12px] bg-surface-muted px-1 rounded">Retry-After</code> and <code className="font-mono text-[12px] bg-surface-muted px-1 rounded">X-Tokener-Quota-Reset</code> regardless of whether a policy, a budget, or a quota stopped the request. Use <code className="font-mono text-[12px] bg-surface-muted px-1 rounded">error.code</code> to tell them apart.
      </p>

      <h3 className="text-lg font-semibold text-text-primary mt-12 mb-4">Control plane errors</h3>
      <p className="text-text-secondary leading-relaxed">
        Control plane endpoints return RFC 7807 problem documents with a stable type, title, status, detail, and the request id for support.
      </p>
      <div className="mt-4"><Code lang="json">{`{
  "type": "https://tokener.io/problems/validation-failed",
  "title": "Validation failed",
  "status": 400,
  "detail": "limit must be greater than zero",
  "requestId": "01J..."
}`}</Code></div>
    </Container>
  );
}
