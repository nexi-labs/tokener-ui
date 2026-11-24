"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Constellation } from "@/components/agents/Constellation";

function Inner() {
  const q = useSearchParams();
  return <Constellation initialSelect={q.get("agent") ?? undefined} trace={q.get("trace") ?? undefined} />;
}

export default function ConstellationPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
