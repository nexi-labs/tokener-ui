"use client";

import { useMemo } from "react";
import { FlowScene } from "@/components/site/FlowScene";
import { buildScene } from "@/lib/usecases/scene";
import type { SceneSpec } from "@/lib/usecases/types";

/** Plays a serialisable scene spec. The server page passes plain data, and the icons are resolved here. */
export function UseCaseScene({ id, spec, className }: { id: string; spec: SceneSpec; className?: string }) {
  const scene = useMemo(() => buildScene(id, spec), [id, spec]);
  return <FlowScene id={id} scene={scene} className={className} />;
}
