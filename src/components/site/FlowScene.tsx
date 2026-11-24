"use client";

import clsx from "clsx";
import { Pause, Play } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { NodeIcon } from "@/components/studio/icons";
import { SCENES, type Scene, type SceneStep } from "@/lib/scenes";

const W = 1000;
const TONE: Record<NonNullable<SceneStep["tone"]>, { color: string; label: string }> = {
  ok: { color: "#02F5A1", label: "Allowed" },
  warn: { color: "#F5B642", label: "Throttled or masked" },
  bad: { color: "#FF6B6B", label: "Blocked or failed" },
  info: { color: "#6CB6FF", label: "Event or data" },
};

/** ky stretches the vertical axis, so a narrow screen gets a taller drawing and the nodes do not overlap. */
function pathFor(a: { x: number; y: number }, b: { x: number; y: number }, ky = 1) {
  const ay = a.y * ky, by = b.y * ky;
  if (Math.abs(a.x - b.x) < 2 || Math.abs(ay - by) < 2) return `M${a.x} ${ay} L${b.x} ${by}`;
  const mx = (a.x + b.x) / 2;
  return `M${a.x} ${ay} C${mx} ${ay}, ${mx} ${by}, ${b.x} ${by}`;
}

/**
 * A choreographed, endlessly looping diagram. Packets travel along edges on a shared cycle, and the node they
 * arrive at lights up with a verdict badge. Motion is decorative, so a pause control is always visible.
 */
export function FlowScene({ id, className, scene: given, bare }: { id: string; className?: string; scene?: Scene; /** No frame and no caption bar, for use inside another frame such as the home page carousel. */ bare?: boolean }) {
  const scene = given ?? SCENES[id];
  const uid = useId().replace(/:/g, "");
  const H0 = scene.height ?? 360;
  const C = scene.cycle;
  const wrap = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [scale, setScale] = useState(1);
  // Below this width the full node cards no longer fit, so nodes shrink to an icon with a short label. The diagram always
  // fits its container; it never scrolls sideways.
  const [compact, setCompact] = useState(false);
  // Nothing is drawn until the width is known, so the full-size cards never flash before the compact layout is chosen.
  const [ready, setReady] = useState(false);
  const ky = compact ? 1.9 : 1;
  const H = H0 * ky;
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setReady(true);
      setCompact(w < 700);
      setScale(w < 700 ? 1 : Math.min(1.2, w / W));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const node = (id: string) => scene.nodes.find((n) => n.id === id)!;
  const edge = (id: string) => scene.edges.find((e) => e.id === id)!;

  const toggle = () => {
    const next = !paused;
    setPaused(next);
    wrap.current?.querySelectorAll("svg").forEach((s) => { try { next ? s.pauseAnimations() : s.unpauseAnimations(); } catch { /* ignore */ } });
  };

  const used = Array.from(new Set(scene.steps.map((s) => s.tone ?? "ok")));

  return (
    <figure className={clsx(!bare && "rounded-2xl border border-white/10", "tok-keep bg-ink-800 overflow-hidden", className)}>
      <div className="overflow-hidden">
        <div ref={wrap} className={clsx("relative w-full mx-auto transition-opacity duration-200", !ready && "opacity-0", paused && "[&_*]:[animation-play-state:paused]")} style={{ aspectRatio: `${W} / ${H}`, maxWidth: scene.maxWidth ?? 1320 }} role="img" aria-label={scene.alt}>
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" aria-hidden>
            <defs>
              <pattern id={`${uid}g`} width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="rgba(2,245,161,0.05)" strokeWidth="1" /></pattern>
            </defs>
            <rect width={W} height={H} fill={`url(#${uid}g)`} />
            {scene.edges.map((e) => {
              const d = pathFor(node(e.from), node(e.to), ky);
              return (
                <g key={e.id}>
                  <path id={`${uid}${e.id}`} d={d} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
                  <path d={d} fill="none" stroke="rgba(2,245,161,0.35)" strokeWidth="1.5" className="tok-flow tok-keep" />
                </g>
              );
            })}
            {scene.steps.map((s, i) => {
              const a = s.at / C;
              const b = Math.min(0.999, (s.at + s.dur) / C);
              const col = TONE[s.tone ?? "ok"].color;
              const e = 0.012;
              const op = `0;0;1;1;0;0`;
              const kt = `0;${a};${a + e};${b - e};${b};1`;
              return (
                <g key={i} opacity="0">
                  <animate attributeName="opacity" values={op} keyTimes={kt} dur={`${C}s`} repeatCount="indefinite" />
                  <circle r="11" fill={col} opacity="0.2">
                    <animateMotion dur={`${C}s`} repeatCount="indefinite" calcMode="linear" keyPoints={`0;0;1;1`} keyTimes={`0;${a};${b};1`}><mpath href={`#${uid}${s.edge}`} /></animateMotion>
                  </circle>
                  <circle r="5" fill={col}>
                    <animateMotion dur={`${C}s`} repeatCount="indefinite" calcMode="linear" keyPoints={`0;0;1;1`} keyTimes={`0;${a};${b};1`}><mpath href={`#${uid}${s.edge}`} /></animateMotion>
                  </circle>
                </g>
              );
            })}
          </svg>

          {scene.nodes.map((n) => {
            const arrivals = scene.steps.filter((s) => edge(s.edge).to === n.id);
            return (
              <div key={n.id} className="absolute" style={{ left: `${(n.x / W) * 100}%`, top: `${(n.y / H0) * 100}%`, transform: `translate(-50%, ${compact ? "-16px" : "-50%"}) scale(${scale})` }}>
                <div className={clsx("relative flex backdrop-blur", compact ? "flex-col items-center gap-1 w-[58px]" : "items-center gap-2 rounded-lg border px-2.5 py-1.5 min-h-[52px] w-[156px]", !compact && (n.core ? "border-accent-500/60 bg-ink-700" : "border-white/15 bg-ink-900/90"))}>
                  <span className={clsx("bg-white grid place-items-center shrink-0", compact ? clsx("h-8 w-8 rounded-lg border-2", n.core ? "border-accent-500" : "border-ink-900") : "h-7 w-7 rounded-md")}>{n.mark ? <img src="/brand/app-icon-accent.svg" alt="" className="h-full w-full rounded-[inherit]" /> : <NodeIcon icon={n.icon} size={compact ? 18 : 18} />}</span>
                  <span className={clsx("min-w-0", compact ? "text-center" : "flex-1")}>
                    <span className={clsx("block font-medium text-text-inverse leading-tight", compact ? "text-[9px] line-clamp-2" : "text-[12px] line-clamp-2")}>{n.label}</span>
                    {n.sub && !compact && <span className="block text-[10px] text-text-tertiary leading-tight line-clamp-2">{n.sub}</span>}
                  </span>
                  {arrivals.map((s, i) => {
                    const col = TONE[s.tone ?? "ok"].color;
                    const delay = `${s.at + s.dur}s`;
                    return (
                      <span key={i}>
                        <span aria-hidden className={clsx("tok-lit tok-keep absolute rounded-lg", compact ? "inset-x-0 mx-auto top-0 h-8 w-8" : "inset-0")} style={{ border: `1.5px solid ${col}`, boxShadow: `0 0 18px ${col}55`, animationDuration: `${C}s`, animationDelay: delay }} />
                        {s.verdict && (
                          <span aria-hidden className={clsx("absolute top-full mt-1.5 flex left-0 right-0", n.x > (compact ? 560 : 780) ? "justify-end" : n.x < (compact ? 300 : 220) ? "justify-start" : "justify-center")}>
                            <span className={"tok-lit tok-keep whitespace-nowrap rounded px-1.5 py-0.5 font-mono " + (compact ? "text-[8.5px]" : "text-[10.5px]")} style={{ color: col, background: `${col}1f`, animationDuration: `${C}s`, animationDelay: delay }}>{s.verdict}</span>
                          </span>
                        )}
                        </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {!bare && <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 px-4 py-3 text-xs text-text-tertiary">
        <span className="text-text-inverse/90">{scene.caption}</span>
        <span className="flex items-center gap-3 ml-auto">
          {used.map((u) => (
            <span key={u} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: TONE[u].color }} />{TONE[u].label}</span>
          ))}
          <button onClick={toggle} aria-pressed={paused} className="inline-flex items-center gap-1.5 hover:text-text-inverse">
            {paused ? <Play size={12} /> : <Pause size={12} />}{paused ? "Play" : "Pause"}
          </button>
        </span>
      </figcaption>}
    </figure>
  );
}
