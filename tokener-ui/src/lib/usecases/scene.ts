import { iconFor } from "@/lib/industry-brands";
import type { Scene, SceneEdge, SceneNode, SceneStep } from "@/lib/scenes";
import type { SceneSpec } from "./types";

const W = 1000;
const STEP = 0.9;

/** Turn a compact spec into the scene the player draws. Throws on unknown ids so mistakes fail the build, not the page. */
export function buildScene(id: string, spec: SceneSpec): Scene {
  const cols = spec.cols.length;
  const maxK = Math.max(...spec.cols.map((c) => c.length));
  const height = Math.max(230, maxK * 96 + 72);
  const nodes: SceneNode[] = [];
  spec.cols.forEach((col, ci) => {
    const x = cols === 1 ? W / 2 : 92 + (ci * (W - 184)) / (cols - 1);
    col.forEach(([nid, label, sub, icon, core], ri) => {
      const k = col.length;
      const y = k === 1 ? height / 2 : 58 + (ri * (height - 116)) / (k - 1);
      nodes.push({ id: nid, x: Math.round(x), y: Math.round(y), label, sub, icon: iconFor(icon), core });
    });
  });
  const have = new Set(nodes.map((n) => n.id));
  const edges: SceneEdge[] = [];
  const steps: SceneStep[] = [];
  let at = 0.3;
  for (const line of spec.flow) {
    if (line === "---") { at += 1.0; continue; }
    const [pair, tone, verdict] = line.split("|");
    const [from, to] = pair.split(">");
    if (!have.has(from) || !have.has(to)) throw new Error(`Scene ${id}: unknown node in "${line}"`);
    const eid = `${from}-${to}`;
    if (!edges.some((x) => x.id === eid)) edges.push({ id: eid, from, to });
    steps.push({ edge: eid, at: Math.round(at * 10) / 10, dur: STEP, tone: (tone || "ok") as SceneStep["tone"], verdict: verdict || undefined });
    at += STEP;
  }
  return { id, cycle: Math.ceil((at + 1.4) * 2) / 2, height, alt: spec.alt, caption: spec.caption, nodes, edges, steps };
}
