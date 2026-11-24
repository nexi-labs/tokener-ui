"use client";

import clsx from "clsx";
import { ArrowRight, Check, Pause, Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { NodeIcon } from "@/components/studio/icons";
import { Lines, Tile } from "@/components/site/IntegrationHub";
import { INDUSTRY_FLOWS, type IndustryFlow } from "@/lib/industry-flows";

/** One industry: workloads on the left, tok∑ner controls in the middle, models on the right, systems underneath. */
function Diagram({ flow, paused = false }: { flow: IndustryFlow; paused?: boolean }) {
  return (
    <div className={clsx(paused && "[&_.tok-flow]:[animation-play-state:paused] [&_.tok-float]:[animation-play-state:paused] [&_.tok-pulse]:[animation-play-state:paused]")}>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_10%_minmax(250px,300px)_10%_minmax(0,1fr)] gap-y-5 items-stretch">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-tertiary h-7">Workloads</p>
          <div className="grid gap-3 lg:grid-rows-4 lg:h-[300px] items-center">
            {flow.workloads.map((w) => <Tile key={w.name} {...w} />)}
          </div>
        </div>
        <div className="hidden lg:block pt-7"><div className="h-[300px]"><Lines dir="in" n={flow.workloads.length} /></div></div>
        <div className="lg:pt-7">
          <div className="relative rounded-2xl border border-accent-500/40 bg-ink-700/60 p-5 lg:h-[300px] flex flex-col justify-center">
            <span className="tok-pulse tok-keep absolute inset-0 rounded-2xl border border-accent-500/50" aria-hidden />
            <Image src="/brand/logo-dark.svg" alt="tok∑ner" width={112} height={35} className="mb-4" />
            <ul className="space-y-2.5">
              {flow.controls.map((c) => (
                <li key={c} className="flex items-start gap-2 text-[13px] text-text-inverse leading-snug">
                  <Check size={14} className="text-accent-500 mt-0.5 shrink-0" strokeWidth={2.4} />{c}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="hidden lg:block pt-7"><div className="h-[300px]"><Lines dir="out" n={flow.models.length} /></div></div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-tertiary h-7">Models</p>
          <div className="grid gap-3 lg:h-[300px] items-center" style={{ gridTemplateRows: `repeat(${flow.models.length}, minmax(0, 1fr))` }}>
            {flow.models.map((m) => <Tile key={m.name} {...m} />)}
          </div>
        </div>
      </div>

      <div className="mt-8 grid lg:grid-cols-[1fr_auto] gap-6 items-center border-t border-white/10 pt-6">
        <p className="text-[15px] leading-relaxed text-text-inverse/90 max-w-3xl">{flow.example}</p>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-tertiary mb-2">Connected systems</p>
          <div className="flex gap-2">
            {flow.systems.map((s, i) => (
              <span key={s.name} title={s.name} className="tok-float tok-keep h-10 w-10 rounded-md bg-white grid place-items-center" style={{ animationDelay: `${i * -0.7}s` }}>
                <NodeIcon icon={s.icon} size={22} />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** For server pages: pass the slug, since icon components cannot cross the server/client boundary. */
export function IndustryDiagram({ slug }: { slug: string }) {
  const flow = INDUSTRY_FLOWS.find((f) => f.slug === slug);
  return flow ? <Diagram flow={flow} /> : null;
}

/** Tabbed explorer. Cycles through industries on its own until the visitor picks one or pauses it. */
export function IndustryExplorer() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setI((x) => (x + 1) % INDUSTRY_FLOWS.length), 8000);
    return () => clearTimeout(t);
  }, [i, paused]);

  const flow = INDUSTRY_FLOWS[i];
  return (
    <div className="rounded-2xl bg-ink-800 border border-ink-700 overflow-hidden">
      <div role="tablist" aria-label="Industries" className="flex gap-1 overflow-x-auto border-b border-white/10 px-3 pt-3">
        {INDUSTRY_FLOWS.map((f, k) => (
          <button
            key={f.slug}
            role="tab"
            aria-selected={k === i}
            onClick={() => { setI(k); setPaused(true); }}
            className={clsx("relative shrink-0 px-4 h-10 rounded-t-md text-sm transition-colors", k === i ? "text-text-inverse bg-white/[0.07]" : "text-text-tertiary hover:text-text-inverse")}
          >
            {f.label}
            {k === i && (
              <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-white/10 overflow-hidden">
                <span key={`${i}-${paused}`} className="tok-keep block h-full bg-accent-500" style={paused ? { width: "100%" } : { animation: "tok-fill 8s linear forwards" }} />
              </span>
            )}
          </button>
        ))}
        <button onClick={() => setPaused((p) => !p)} aria-pressed={paused} className="ml-auto self-center shrink-0 inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-inverse px-3">
          {paused ? <Play size={12} /> : <Pause size={12} />}{paused ? "Play" : "Pause"}
        </button>
      </div>
      <div className="p-5 sm:p-8" role="tabpanel">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-6">
          <div>
            <h3 className="text-xl font-semibold text-text-inverse">{flow.label}</h3>
            <p className="text-sm text-text-tertiary mt-1">{flow.tagline}</p>
          </div>
          <Link href={`/solutions/${flow.slug}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-500 hover:underline">
            See the {flow.label.toLowerCase()} page <ArrowRight size={14} />
          </Link>
        </div>
        <Diagram flow={flow} paused={paused} />
      </div>
    </div>
  );
}
