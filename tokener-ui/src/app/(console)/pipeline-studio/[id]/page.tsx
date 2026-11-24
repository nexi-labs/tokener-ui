"use client";

import { useParams } from "next/navigation";
import { PipelineEditor } from "@/components/mlops/PipelineEditor";

export default function Builder() {
  const { id } = useParams<{ id: string }>();
  return <PipelineEditor pipelineId={id} mode="builder" base="/pipeline-studio" />;
}
