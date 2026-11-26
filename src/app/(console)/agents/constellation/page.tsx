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
  return view === "graph"
    ? <AgentGraph initialSelect={agent} onSwitchView={() => pick("map")} />
    : <Constellation initialSelect={agent} trace={q.get("trace") ?? undefined} onSwitchView={() => pick("graph")} />;
}

export default function ConstellationPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
