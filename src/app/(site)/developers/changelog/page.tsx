import { Container, Eyebrow, H2 } from "@/components/site/ui";
import { ROADMAP } from "@/lib/site";

export const metadata = { title: "Platform scope | tok∑ner" };

export default function RoadmapPage() {
  return (
    <Container className="py-14 sm:py-20 max-w-[860px]">
      <Eyebrow>Platform scope</Eyebrow>
      <H2>What the platform covers, area by area.</H2>
      <p className="text-text-secondary mt-4 leading-relaxed">Every area below ships as part of one platform. The list grows as capabilities are added, and nothing here needs a separate product.</p>
      <ol className="mt-12 relative border-l border-border-strong ml-3 flex flex-col gap-12">
        {ROADMAP.map((r) => (
          <li key={r.area} className="pl-8 relative">
            <span className="absolute -left-[7px] top-1.5 h-3.5 w-3.5 rounded-full bg-accent-500 border-2 border-surface" />
            <div className="font-mono text-xs uppercase tracking-wider text-accent-700">{r.area}</div>
            <h2 className="text-xl font-semibold text-text-primary mt-1">{r.title}</h2>
            <ul className="mt-4 flex flex-col gap-2 text-sm text-text-secondary">
              {r.items.map((i) => (
                <li key={i} className="flex gap-2.5"><span className="mt-[7px] h-1 w-1 rounded-full bg-text-tertiary shrink-0" />{i}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </Container>
  );
}
