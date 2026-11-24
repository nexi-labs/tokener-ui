"use client";

import { useParams } from "next/navigation";
import { PipelineEditor } from "@/components/mlops/PipelineEditor";

export default function Edit() {
  const { id } = useParams<{ id: string }>();
  return <PipelineEditor pipelineId={id} mode="builder" />;
}
