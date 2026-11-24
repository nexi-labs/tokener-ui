"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { FlowScene } from "@/components/site/FlowScene";
import { HERO_SLIDES, type Scene } from "@/lib/scenes";

/** Each slide plays its story once in about the time it stays on screen, so a visitor sees a whole loop and not the middle of one. */
const SPEED = 0.62;
const quick = (s: Scene): Scene => ({ ...s, cycle: s.cycle * SPEED, steps: s.steps.map((x) => ({ ...x, at: x.at * SPEED, dur: x.dur * SPEED })) });
const SLIDES = HERO_SLIDES.map((s) => ({ ...s, scene: quick(s.scene) }));

/**
 * Six small use case diagrams that slide on their own, each for about as long as its story takes. Only the diagrams move; the text beside them stays put.
 * It rests while the pointer is over it. It keeps playing for people whose system asks for reduced motion, but then changes slide without sliding.
 */
export function HeroCarousel() {
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  const [still, setStill] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const q = window.matchMedia("(prefers-reduced-motion: reduce)"); setStill(q.matches); const f = () => setStill(q.matches); q.addEventListener("change", f); return () => q.removeEventListener("change", f); }, []);
  useEffect(() => {
    if (hold) return;
    const t = setTimeout(() => setI((x) => (x + 1) % SLIDES.length), SLIDES[i].scene.cycle * 1000 + 700);
    return () => clearTimeout(t);
  }, [i, hold]);

  return (
    <section aria-roledescription="carousel" aria-label="What tok∑ner does" className="w-full min-w-0 max-w-[600px] lg:justify-self-end"
      onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}>
      <div className="rounded-xl border border-white/10 bg-ink-900/80 overflow-hidden">
        <div className="overflow-hidden" ref={box}>
          <div className={clsx("flex", !still && "transition-transform duration-700 ease-out")} style={{ transform: `translateX(-${i * 100}%)` }}>
            {SLIDES.map((s, k) => (
              <div key={s.id} className="w-full shrink-0" role="group" aria-roledescription="slide" aria-label={`${k + 1} of ${SLIDES.length}: ${s.tag}`} aria-hidden={k !== i}>
                <div className="px-5 pt-4 pb-1 flex items-baseline gap-3"><span className="text-[11px] uppercase tracking-[0.12em] text-accent-500">{s.tag}</span><span className="text-[13px] text-text-inverse/85">{s.title}</span></div>
                <FlowScene key={k === i ? `${s.id}-on-${i}` : s.id} id={s.id} scene={s.scene} bare />
              </div>))}
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 px-4 pb-3.5 pt-1" role="tablist" aria-label="Choose a slide">
          {SLIDES.map((s, k) => <button key={s.id} role="tab" aria-selected={k === i} aria-label={s.tag} onClick={() => setI(k)} className={clsx("h-1.5 rounded-full transition-all", k === i ? "w-7 bg-accent-500" : "w-1.5 bg-white/25 hover:bg-white/45")} />)}
        </div>
      </div>
    </section>
  );
}
