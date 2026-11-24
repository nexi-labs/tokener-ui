"use client";

import { useParams } from "next/navigation";
import { McpServerEditor } from "@/components/mlops/McpServerEditor";

export default function McpServerPage() {
  const { id } = useParams<{ id: string }>();
  return <McpServerEditor id={id} />;
}
