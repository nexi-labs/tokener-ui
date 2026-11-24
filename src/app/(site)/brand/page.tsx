import Image from "next/image";
import { Container, PageHero } from "@/components/site/ui";

export const metadata = { title: "Brand | tok∑ner" };

type Item = { file: string; label: string; use: string; bg: string; w: number; h: number; png?: string };

const WORD: Item[] = [
  { file: "logo-light", label: "Wordmark, light backgrounds", use: "Default on white and light grey.", bg: "bg-white", w: 240, h: 75, png: "logo-light" },
  { file: "logo-dark", label: "Wordmark, dark backgrounds", use: "Default on #07191E and photography.", bg: "bg-ink-800", w: 240, h: 75, png: "logo-dark" },
  { file: "logo-mono-ink", label: "Wordmark, one color ink", use: "Print, fax, single-ink and on accent green.", bg: "bg-accent-500", w: 240, h: 75, png: "logo-mono-ink" },
  { file: "logo-mono-white", label: "Wordmark, one color white", use: "On photography and dark brand colors.", bg: "bg-ink-600", w: 240, h: 75, png: "logo-mono-white" },
];
const MARK: Item[] = [
  { file: "logomark", label: "Short logo, light", use: "Small spaces under 120px wide, collapsed navigation.", bg: "bg-white", w: 110, h: 93, png: "logomark" },
  { file: "logomark-dark", label: "Short logo, dark", use: "Collapsed sidebar, dark headers.", bg: "bg-ink-800", w: 110, h: 93, png: "logomark-dark" },
  { file: "logomark-mono-ink", label: "Short logo, one color ink", use: "Single-ink uses.", bg: "bg-accent-500", w: 110, h: 93, png: "logomark-mono-ink" },
  { file: "logomark-mono-white", label: "Short logo, one color white", use: "On dark brand colors.", bg: "bg-ink-600", w: 110, h: 93, png: "logomark-mono-white" },
  { file: "sigma", label: "Sigma", use: "Avatars, loaders and favicons where the t is too small to read.", bg: "bg-ink-800", w: 78, h: 93, png: "sigma" },
  { file: "sigma-ink", label: "Sigma, ink", use: "Single-ink avatars.", bg: "bg-white", w: 78, h: 93, png: "sigma-ink" },
];
const ICONS: Item[] = [
  { file: "app-icon", label: "App icon, dark", use: "Default app tile and favicon.", bg: "bg-surface-muted", w: 96, h: 96, png: "app-icon" },
  { file: "app-icon-accent", label: "App icon, accent", use: "Marketing and social avatars.", bg: "bg-surface-muted", w: 96, h: 96, png: "app-icon-accent" },
  { file: "app-icon-light", label: "App icon, light", use: "Light mode listings.", bg: "bg-surface-muted", w: 96, h: 96, png: "app-icon-light" },
];

function Card({ i }: { i: Item }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden bg-surface">
      <div className={`${i.bg} h-44 grid place-items-center`}>
        <Image src={`/brand/${i.file}.svg`} alt={i.label} width={i.w} height={i.h} unoptimized />
      </div>
      <div className="p-4">
        <div className="text-sm font-semibold text-text-primary">{i.label}</div>
        <p className="text-[13px] text-text-secondary mt-1">{i.use}</p>
        <div className="flex gap-3 mt-3 text-[13px] font-medium">
          <a className="text-accent-700 hover:underline" href={`/brand/${i.file}.svg`} download>SVG</a>
          {i.png && <a className="text-accent-700 hover:underline" href={`/brand/png/${i.png}.png`} download>PNG</a>}
        </div>
      </div>
    </div>
  );
}

function Group({ title, items }: { title: string; items: Item[] }) {
  return (
    <div className="mt-14 first:mt-0">
      <h2 className="font-display text-2xl text-text-primary mb-5">{title}</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((i) => (
          <Card key={i.file} i={i} />
        ))}
      </div>
    </div>
  );
}

export default function BrandPage() {
  return (
    <>
      <PageHero eyebrow="Brand" title="The tok∑ner logo, in every version." lead="Use the files as they are. Do not recolor, stretch, rotate the Sigma, or redraw the letters." />
      <section className="py-16 sm:py-20">
        <Container>
          <Group title="Long logo" items={WORD} />
          <Group title="Short logo and Sigma" items={MARK} />
          <Group title="App icons" items={ICONS} />

          <div className="mt-16 grid md:grid-cols-3 gap-6 text-[14px] text-text-secondary leading-relaxed">
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">Colors</h3>
              Ink <code className="font-mono text-xs">#0D1120</code>, deep <code className="font-mono text-xs">#07191E</code>, accent{" "}
              <code className="font-mono text-xs">#02F5A1</code>. On white use accent only as a fill for the Sigma, never for text.
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">Clear space</h3>
              Keep at least the width of the letter n free on every side of the long logo.
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">Minimum size</h3>
              Long logo 96px wide on screen. Below that, use the short logo. Below 24px, use the Sigma.
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
