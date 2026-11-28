import { Lock, KeyRound, ShieldCheck, ScrollText, Globe2, Database } from "lucide-react";
import { Container, PageHero, Eyebrow, H2, CtaBand, LinkButton } from "@/components/site/ui";

export const metadata = { title: "Security and trust | tok∑ner" };

const BLOCKS = [
  { icon: KeyRound, title: "Identity", body: "Sign in with Google, Microsoft, GitHub, or an email and password. Passwords are hashed with PBKDF2 and checked against a strength policy, sessions use short-lived access tokens with rotating refresh tokens, and a reused refresh token ends the whole session. Application keys are hashed at rest and never logged." },
  { icon: ShieldCheck, title: "Authorization", body: "Role based access for coarse control and attribute based rules for fine control, evaluated on the same engine as data plane policy. Role changes are audited." },
  { icon: Lock, title: "Encryption", body: "TLS 1.2 or higher everywhere, mutual TLS inside the service mesh, encrypted volumes, and column-level encryption for sensitive fields where prompt logging is enabled." },
  { icon: Database, title: "Tenant isolation", body: "Application-layer filtering, PostgreSQL row-level security, and tenant-keyed Kafka partitioning with ACLs where feasible. Each layer is independently sufficient." },
  { icon: ScrollText, title: "Immutable audit", body: "Every policy, budget, provider, and pricing change is recorded with actor and before and after state. The API database role has no update or delete grant on the audit log." },
  { icon: Globe2, title: "Data residency", body: "Policy rules and provider routing constraints keep requests inside approved regions. Prompt and response logging is opt-in per tenant and off by default." },
];

export default function SecurityPage() {
  return (
    <>
      <PageHero eyebrow="Security and trust" title="Designed so one mistake is never enough." lead="Layered controls, secrets in a vault, and an audit trail you cannot rewrite.">
        <LinkButton href="/contact" arrow>Request the security pack</LinkButton>
      </PageHero>
      <section className="py-16 sm:py-24">
        <Container className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {BLOCKS.map((b) => {
            const Icon = b.icon;
            return (
              <div key={b.title} className="rounded-xl border border-border p-7">
                <Icon size={22} strokeWidth={1.6} className="text-ink-500 mb-4" />
                <h3 className="font-semibold text-text-primary">{b.title}</h3>
                <p className="text-sm text-text-secondary mt-2 leading-relaxed">{b.body}</p>
              </div>
            );
          })}
        </Container>
      </section>
      <section className="py-16 bg-surface-subtle border-y border-border">
        <Container className="grid lg:grid-cols-2 gap-10">
          <div>
            <Eyebrow>Secrets</Eyebrow>
            <H2 className="text-[1.6rem] sm:text-[2rem]">Vault is the source of truth.</H2>
          </div>
          <div className="text-text-secondary leading-relaxed text-[15px] flex flex-col gap-4">
            <p>Provider keys, database credentials, billing keys, and identity provider secrets live in HashiCorp Vault. Pods authenticate with the Kubernetes auth method and receive short-lived credentials through an injected sidecar.</p>
            <p>No long-lived secret is stored in a Kubernetes Secret object, an image, or a config map. Where the datastore supports it, database credentials are issued dynamically so a leaked credential has a short life.</p>
            <p>SOC 2 Type II is in progress. Contact us for the current status of audits and attestations.</p>
          </div>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
