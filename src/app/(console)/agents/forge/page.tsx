"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Forge } from "@/components/agents/Forge";

function Inner() {
  const q = useSearchParams(); const edit = q.get("agent") ?? undefined;
  return (
    <div>
      <PageHeader title={edit ? "Edit in Agent Forge" : "Agent Forge"} description="Build an agent on tok∑ner. Choose a framework, describe the agent, and Forge generates a project that calls models and tools through the gateway, so it is governed from its first request." />
      <Forge key={edit ?? "new"} editId={edit} />
    </div>
  );
}
export default function ForgePage() { return <Suspense fallback={null}><Inner /></Suspense>; }
