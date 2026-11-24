"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { TutorialView } from "@/components/mlops/TutorialView";
import { tutorialBySlug } from "@/lib/mlops/tutorials";

export default function TutorialPage() {
  const { slug } = useParams<{ slug: string }>();
  const t = tutorialBySlug(slug);
  if (!t) notFound();
  return (
    <div className="space-y-5">
      <Link href="/mlops/learn" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"><ArrowLeft size={13} /> Templates and tutorials</Link>
      <PageHeader title={t.title} />
      <TutorialView t={t} inConsole />
    </div>
  );
}
