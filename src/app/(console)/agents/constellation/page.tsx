"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AgentGraph } from "@/components/agents/AgentGraph";
import { Constellation } from "@/components/agents/Constellation";

type View = "map" | "graph";
const KEY = "tok.agents.view";

/** Constellation and the Graph are two views of the same agents on one page, switched with a button on the canvas, like the theme. */
function Inner() {
  const q = useSearchParams(); const asked = q.get("view");
  const [view, setView] = useState<View>(asked === "graph" ? "graph" : "map");
  useEffect(() => { if (asked === "graph" || asked === "map") return; try { if (localStorage.getItem(KEY) === "graph") setView("graph"); } catch { /* storage unavailable */ } }, [asked]);
  const pick = (v: View) => { setView(v); try { localStorage.setItem(KEY, v); } catch { /* storage unavailable */ } };
  const agent = q.get("agent") ?? undefined;
  // Full page lets the canvas fill the browser. Escape closes it, and it never survives leaving the page.
  const [full, setFull] = useState(false); const toggleFull = () => setFull((v) => !v);
  useEffect(() => { if (!full) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [full]);
  return view === "graph"
    ? <AgentGraph initialSelect={agent} onSwitchView={() => pick("map")} fullPage={full} onToggleFull={toggleFull} />
    : <Constellation initialSelect={agent} trace={q.get("trace") ?? undefined} onSwitchView={() => pick("graph")} full={full} onToggleFull={toggleFull} />;
}

export default function ConstellationPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
