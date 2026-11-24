"use client";

import clsx from "clsx";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type Slide = { title: string; body: string; visual: ReactNode; note?: string };

/**
 * Product-story carousel with numbered indicators. The numbers navigate slides. They are distinct
 * from workflow step numbers, so each indicator is labelled "Slide n of N". Autoplay stops for
 * reduced-motion users, on hover or focus, and when paused.
 */
export function StoryCarousel({ slides, interval = 7000, label }: { slides: Slide[]; interval?: number; label: string }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [reduced, setReduced] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const f = () => setReduced(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);

  const auto = !paused && !hover && !reduced;
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => setI((x) => (x + 1) % slides.length), interval);
    return () => clearTimeout(t);
  }, [auto, i, interval, slides.length]);

  const go = (n: number) => setI((n + slides.length) % slides.length);
  const s = slides[i];

  return (
    <section aria-roledescription="carousel" aria-label={label} ref={ref} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)} onBlur={() => setHover(false)}
      onKeyDown={(e) => { if (e.key === "ArrowRight") go(i + 1); if (e.key === "ArrowLeft") go(i - 1); }}
      className="bg-surface border border-border rounded-lg shadow-card overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="p-6 lg:p-7 flex flex-col">
          <div className="text-[11px] uppercase tracking-wider text-text-tertiary font-medium">Slide {i + 1} of {slides.length}</div>
          <h2 className="text-lg font-semibold tracking-tight text-text-primary mt-2" aria-live={auto ? "off" : "polite"}>{s.title}</h2>
          <p className="text-sm text-text-secondary mt-2 leading-relaxed">{s.body}</p>
          {s.note && <p className="font-hand text-[19px] leading-snug text-note mt-3">{s.note}</p>}
          <div className="mt-auto pt-5 flex items-center gap-3">
            <ol role="tablist" aria-label="Choose slide" className="flex items-center gap-1.5">
              {slides.map((sl, n) => (
                <li key={n}>
                  <button role="tab" aria-selected={n === i} aria-label={`Slide ${n + 1} of ${slides.length}: ${sl.title}`} onClick={() => setI(n)}
                    className={clsx("h-7 min-w-7 px-1.5 rounded-md text-xs font-medium tabular-nums border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60",
                      n === i ? "bg-emph border-emph text-on-emph" : "border-border-strong text-text-secondary hover:bg-surface-muted")}>
                    {n + 1}
                  </button>
                </li>
              ))}
            </ol>
            {!reduced && (
              <button onClick={() => setPaused((p) => !p)} aria-label={paused ? "Play slides" : "Pause slides"} className="h-7 w-7 grid place-items-center rounded-md text-text-secondary hover:bg-surface-muted">
                {paused ? <Play size={14} /> : <Pause size={14} />}
              </button>
            )}
          </div>
        </div>
        <div className="bg-surface-subtle border-t lg:border-t-0 lg:border-l border-border min-h-[240px] p-4 grid place-items-center">{s.visual}</div>
      </div>
    </section>
  );
}

/** Small illustrative flow. Edges animate continuously, and a loop never resets visibly. */
export function FlowStrip({ nodes, accentIndex, branch }: { nodes: string[]; accentIndex?: number; branch?: { from: number; label: string } }) {
  const w = 112, gap = 26, h = 40;
  const total = nodes.length * w + (nodes.length - 1) * gap;
  const rows = branch ? 2 : 1;
  const H = rows * h + (branch ? 46 : 0) + 24;
  return (
    <svg viewBox={`0 0 ${total + 24} ${H}`} className="w-full max-w-[640px]" role="img" aria-label={`Flow: ${nodes.join(", then ")}`}>
      {nodes.map((n, k) => {
        const x = 12 + k * (w + gap), y = 12;
        return (
          <g key={n + k}>
            {k < nodes.length - 1 && <line x1={x + w} y1={y + h / 2} x2={x + w + gap} y2={y + h / 2} stroke="#6B7F84" strokeWidth="1.5" className="tok-flow" />}
            <rect x={x} y={y} width={w} height={h} rx="8" fill="rgb(var(--c-surface))" stroke={k === accentIndex ? "#00B876" : "#C9D2D4"} strokeWidth={k === accentIndex ? 2 : 1} />
            <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="rgb(var(--c-text-primary))">{n}</text>
          </g>
        );
      })}
      {branch && (() => {
        const x = 12 + branch.from * (w + gap) + w / 2;
        return (
          <g>
            <path d={`M ${x} ${12 + h} C ${x} ${12 + h + 40}, ${x - 30} ${12 + h + 30}, ${x - 30} ${12 + h + 36}`} fill="none" stroke="#DC3B3B" strokeWidth="1.5" className="tok-flow" />
            <rect x={x - 30 - w / 2} y={12 + h + 34} width={w} height={h - 8} rx="8" fill="rgb(var(--c-surface))" stroke="#DC3B3B" strokeWidth="1.2" strokeDasharray="4 3" />
            <text x={x - 30} y={12 + h + 34 + (h - 8) / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="#B02A2A">{branch.label}</text>
          </g>
        );
      })()}
    </svg>
  );
}
