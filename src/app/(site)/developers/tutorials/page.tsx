import Link from "next/link";
import { Clock } from "lucide-react";
import { Container, Eyebrow, H2, Lead } from "@/components/site/ui";
import { TUTORIALS } from "@/lib/mlops/tutorials";

export const metadata = { title: "Tutorials | Developers | tok∑ner", description: "Step-by-step MLOps tutorials with prerequisites, versions, warnings, verification, cleanup and vendor references." };

export default function Tutorials() {
  return (
    <section className="py-14 sm:py-20">
      <Container>
        <Eyebrow>Tutorials</Eyebrow>
        <H2>Learn by doing, with real commands.</H2>
        <Lead>Each tutorial lists prerequisites and tested versions, flags security and cost risks, and ends with verification, expected output, cleanup and troubleshooting. Console steps show the matching screen and what to select there.</Lead>
        <div className="grid md:grid-cols-2 gap-5 mt-10">
          {TUTORIALS.map((t) => (
            <Link key={t.slug} href={`/developers/tutorials/${t.slug}`} className="rounded-xl border border-border p-6 hover:border-border-strong hover:shadow-card transition-all flex flex-col">
              <div className="flex items-center gap-3 text-xs text-text-tertiary"><span className="font-semibold text-text-secondary">{t.level}</span><span className="inline-flex items-center gap-1"><Clock size={12} /> {t.minutes} min</span></div>
              <h3 className="font-semibold text-text-primary mt-2">{t.title}</h3>
              <p className="text-sm text-text-secondary mt-1.5 flex-1">{t.summary}</p>
              <div className="text-xs text-text-tertiary mt-3">{t.versions[0]}</div>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
