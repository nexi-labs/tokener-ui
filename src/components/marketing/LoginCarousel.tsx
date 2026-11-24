"use client";

import "@fontsource/caveat/latin-600.css";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import clsx from "clsx";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IndustryArt } from "@/components/site/IndustryArt";

type Slide = {
  eyebrow: string;
  lead: string;
  hand: string;
  body: string;
  note: string;
  proof: string;
  visual: ReactNode;
};

const DURATION = 9000;

const SLIDES: Slide[] = [
  {
    eyebrow: "Banking",
    lead: "Show the auditor",
    hand: "who used which model.",
    body: "Each call records who asked, which model answered, under which policy version and at what cost, in an append-only trail you can export as evidence.",
    note: "one record per decision",
    proof: "audit export as CSV for reviewers",
    visual: <IndustryArt kind="banking" />,
  },
  {
    eyebrow: "Healthcare",
    lead: "Summaries a clinician",
    hand: "signs before they land.",
    body: "Documents are masked while they are processed, drafts wait for a named approver, and the approval becomes part of the record.",
    note: "a person approves the write",
    proof: "approval gates on every change to a system",
    visual: <IndustryArt kind="healthcare" />,
  },
  {
    eyebrow: "Manufacturing",
    lead: "Run models beside",
    hand: "the production line.",
    body: "Connect your clusters, registries and data stores. Roll a model out to a plant with a canary and a way back, under the same identity, policy and audit trail.",
    note: "central control, local inference",
    proof: "read-only by default, secrets stay in your vault",
    visual: <IndustryArt kind="manufacturing" />,
  },
  {
    eyebrow: "Energy and utilities",
    lead: "Brief the engineer",
    hand: "before the pager rings.",
    body: "Alarm streams are summarised through the gateway, with policy and budget applied. A short briefing reaches the on-call engineer instead of a flood of alerts.",
    note: "one briefing, not fifty alarms",
    proof: "stream in, briefing out, every step logged",
    visual: <IndustryArt kind="energy" />,
  },
  {
    eyebrow: "Logistics",
    lead: "Catch the exception",
    hand: "before the customer does.",
    body: "Carrier notices are matched to shipments and a reply is drafted. A dispatcher approves it before anything is sent.",
    note: "approve, then it sends",
    proof: "drafts first, nothing leaves without approval",
    visual: <IndustryArt kind="logistics" />,
  },
];

function Underline() {
  return (
    <svg className="absolute left-0 right-0 -bottom-1.5 w-full h-2.5 overflow-visible" viewBox="0 0 200 10" preserveAspectRatio="none" fill="none" aria-hidden>
      <path d="M2 6 C 30 1, 55 9, 90 5 S 150 2, 198 6" stroke="#02F5A1" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg width="62" height="40" viewBox="0 0 62 40" fill="none" stroke="#02F5A1" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M58 3 C 42 5, 20 12, 8 33" />
      <path d="M2 23 L8 34 L19 28" />
    </svg>
  );
}

export function LoginCarousel() {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>();
  // The outgoing slide stays mounted for the length of the cross-fade, so the loop (including 5 back to 1) never jumps.
  const go = (to: number) => {
    setIndex((cur) => {
      if (cur === to) return cur;
      setLeaving(cur);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setLeaving(null), 700);
      return to;
    });
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const [userPaused, setUserPaused] = useState(false);
  // Autoplay is driven by a timer, not by animation events, so it keeps running regardless of the
  // visual treatment. A pause control (WCAG 2.2.2) and hover pause are always available.
  const running = !paused && !userPaused;
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => go((index + 1) % SLIDES.length), DURATION);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, index]);

  return (
    <div
      className="tok-keep relative flex-1 flex flex-col min-h-0"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mt-[clamp(8px,7vh,64px)] grid" aria-live={paused ? "polite" : "off"}>
        {SLIDES.map((slide, i) => {
          const active = i === index;
          if (!active && i !== leaving) return null;
          return (
            <div
              key={slide.eyebrow}
              style={{ gridArea: "1 / 1" }}
              aria-hidden={!active}
              className={clsx("transition-[opacity,transform] duration-700 ease-out", active ? "opacity-100 translate-y-0 animate-slide-in" : "opacity-0 -translate-y-2 pointer-events-none")}
            >

        <div className="mb-3">
          <p className="font-code text-accent-500 text-[11px] font-medium tracking-[0.2em] uppercase">{slide.eyebrow}</p>
        </div>
        <h2 className="font-editorial text-text-inverse text-[2.7rem] xl:text-[3.2rem] leading-[1.02] max-w-[640px]">
          {slide.lead}{" "}
          <span className="relative inline-block font-hand text-accent-500 text-[3rem] xl:text-[3.6rem] leading-[0.9] -rotate-1 whitespace-nowrap">
            {slide.hand}
            <Underline />
          </span>
        </h2>
        <p className="text-text-tertiary text-[15px] leading-relaxed mt-5 max-w-[600px] [@media(max-height:800px)]:hidden">{slide.body}</p>

        <div className="relative mt-16 [@media(max-height:800px)]:mt-14">
          <div className="absolute -top-[46px] right-3 z-10 flex items-end gap-1 -rotate-2 pointer-events-none">
            <Arrow />
            <span className="font-hand text-accent-500 text-[1.55rem] leading-none pb-3 whitespace-nowrap">{slide.note}</span>
          </div>
          {slide.visual}
        </div>

        <p className="font-code text-[11px] text-text-tertiary mt-3 tracking-wide [@media(max-height:800px)]:hidden">
          <span className="text-accent-500">&rarr;</span> {slide.proof}
        </p>
            </div>
          );
        })}
      </div>

      <div className="mt-auto pt-5 flex items-center">
        <button onClick={() => setUserPaused((v) => !v)} aria-label={userPaused ? "Play slideshow" : "Pause slideshow"} className="h-6 w-6 grid place-items-center rounded text-text-tertiary hover:text-text-inverse">
          {userPaused ? <Play size={13} /> : <Pause size={13} />}
        </button>
      </div>
    </div>
  );
}
