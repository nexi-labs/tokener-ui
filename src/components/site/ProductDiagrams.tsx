import { Container, Eyebrow, H2 } from "@/components/site/ui";
import { UseCaseScene } from "@/components/site/UseCaseScene";
import type { Diagram } from "@/lib/product-diagrams";

/**
 * Feature diagrams for a product page. Each diagram is an animated line diagram of one thing the product does,
 * with a short explanation above it, so a reader can see the behaviour and not only read about it.
 */
export function ProductDiagrams({ diagrams, product }: { diagrams: Diagram[]; product: string }) {
  if (diagrams.length === 0) return null;
  return (
    <section className="pb-16 sm:pb-24" aria-labelledby="diagrams-heading">
      <Container>
        <Eyebrow>See it work</Eyebrow>
        <H2 className="text-[1.6rem] sm:text-[2rem]"><span id="diagrams-heading">{product}, one feature at a time.</span></H2>
        <p className="text-text-secondary mt-3 max-w-2xl leading-relaxed">Each diagram replays a real behaviour of the product on a loop. Pause any of them with the control in the corner.</p>
        <div className="mt-10 space-y-14">
          {diagrams.map((d, i) => (
            <article key={d.id} id={d.id} className="scroll-mt-24">
              <div className="flex items-start gap-4">
                <span className="mt-1 h-7 min-w-7 px-2 rounded-full bg-ink-800 text-accent-500 text-xs font-mono grid place-items-center shrink-0">{i + 1}</span>
                <div className="max-w-3xl">
                  <h3 className="text-lg sm:text-xl font-semibold text-text-primary">{d.title}</h3>
                  <p className="text-sm sm:text-[15px] text-text-secondary mt-2 leading-relaxed">{d.lead}</p>
                </div>
              </div>
              <div className="mt-5"><UseCaseScene id={d.id} spec={d.spec} /></div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
