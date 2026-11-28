import { Container, PageHero } from "@/components/site/ui";
import { Badge } from "@/components/ui/Badge";

export const metadata = { title: "Status | tok∑ner" };

const COMPONENTS = [
  ["Data plane gateway", "99.97%"],
  ["Control plane API", "99.99%"],
  ["Policy engine", "99.99%"],
  ["Token accounting pipeline", "99.98%"],
  ["Document processing", "99.95%"],
  ["Analytics", "99.96%"],
];

export default function StatusPage() {
  return (
    <>
      <PageHero eyebrow="Status" title="All systems operational." lead="Preview data. Connect your monitoring stack to publish live health." />
      <section className="py-16 sm:py-24">
        <Container className="max-w-[820px]">
          <div className="rounded-xl border border-border divide-y divide-border">
            {COMPONENTS.map(([n, u]) => (
              <div key={n} className="flex items-center justify-between px-5 py-4">
                <span className="text-sm font-medium text-text-primary">{n}</span>
                <span className="flex items-center gap-4">
                  <span className="text-xs text-text-tertiary tabular-nums">90 day uptime {u}</span>
                  <Badge tone="healthy">operational</Badge>
                </span>
              </div>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
