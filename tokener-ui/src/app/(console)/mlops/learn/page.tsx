"use client";

import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { Notice } from "@/components/mlops/ui";
import { TUTORIALS } from "@/lib/mlops/tutorials";

export default function LearnPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Templates and tutorials" description="Hands-on guides with prerequisites, versions, security and cost warnings, verification, cleanup and vendor references. Pipeline templates live in the builder." />
      <Notice tone="info" title="How to read these">Vendor commands are real and run against your own systems. Steps marked "In the console" show the matching screen and what to select there.</Notice>
      <div className="grid md:grid-cols-2 gap-4">
        {TUTORIALS.map((t) => (
          <Link key={t.slug} href={`/mlops/learn/${t.slug}`} className="group bg-surface border border-border rounded-lg p-4 shadow-card hover:border-border-strong transition-colors flex flex-col">
            <div className="flex items-center gap-2"><Badge tone="neutral">{t.level}</Badge><span className="inline-flex items-center gap-1 text-xs text-text-tertiary"><Clock size={12} /> {t.minutes} min</span></div>
            <div className="text-[15px] font-semibold mt-2.5">{t.title}</div>
            <p className="text-[13px] text-text-secondary mt-1 flex-1">{t.summary}</p>
            <div className="text-xs text-text-tertiary mt-3 flex items-center justify-between"><span>{t.versions[0]}</span><span className="inline-flex items-center gap-1 text-text-primary group-hover:gap-1.5 transition-all">Open <ArrowRight size={13} /></span></div>
          </Link>
        ))}
      </div>
      <div className="bg-surface border border-border rounded-lg p-4 shadow-card flex flex-wrap items-center justify-between gap-3">
        <div><div className="text-sm font-semibold">Pipeline templates</div><p className="text-[13px] text-text-secondary mt-0.5">Start from a release, production promotion or retrieval pipeline. Templates open in the builder or the guided wizard on the same spec.</p></div>
        <Link href="/mlops/pipelines/new" className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2">Browse templates <ArrowRight size={14} /></Link>
      </div>
    </div>
  );
}
