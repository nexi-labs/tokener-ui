"use client";

import clsx from "clsx";
import { Pause, Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { NodeIcon } from "@/components/studio/icons";
import { CONNECTOR_GROUPS, SDK_LANGS } from "@/lib/connectors";
import type { IconRef } from "@/components/studio/types";

const byName = (gid: string, names: string[]) => {
  const g = CONNECTOR_GROUPS.find((x) => x.id === gid)!;
  return names.map((n) => g.items.find((i) => i.name === n)!).filter(Boolean);
};

const APPS: { name: string; icon: IconRef }[] = [
  ...SDK_LANGS.slice(0, 5),
  { name: "LangChain", icon: CONNECTOR_GROUPS.find((g) => g.id === "delivery")!.items.find((i) => i.name === "LangChain")!.icon },
];
const MODELS = byName("ai-providers", ["OpenAI", "Anthropic", "Google Gemini", "Amazon Bedrock", "Azure OpenAI", "Mistral AI"]);

const AROUND = [
  { id: "identity", label: "Identity", names: ["Okta", "Auth0", "Keycloak", "Microsoft Entra ID"] },
  { id: "observability", label: "Observability", names: ["OpenTelemetry", "Prometheus", "Datadog", "Splunk"] },
  { id: "notifications", label: "Alerts", names: ["Slack", "PagerDuty", "Jira", "SendGrid"] },
  { id: "secrets", label: "Secrets", names: ["HashiCorp Vault", "AWS Secrets Manager", "Azure Key Vault", "1Password"] },
  { id: "data", label: "Data and vectors", names: ["PostgreSQL", "Apache Kafka", "Milvus", "Amazon S3"] },
  { id: "cloud", label: "Infrastructure", names: ["Kubernetes", "Amazon Web Services", "Google Cloud", "Docker"] },
];

const ROWS = 6;

export function Tile({ name, icon }: { name: string; icon: IconRef }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white px-3.5 h-12 shadow-[0_1px_0_rgba(255,255,255,0.08)] min-w-0">
      <span className="h-7 w-7 grid place-items-center shrink-0"><NodeIcon icon={icon} size={22} /></span>
      <span className="text-sm font-medium text-ink-800 truncate">{name}</span>
    </div>
  );
}

export function Lines({ dir, n = ROWS }: { dir: "in" | "out"; n?: number }) {
  // Each row centre sits at (i + 0.5) in a viewBox that is ROWS tall, so the curves land on the tiles.
  const mid = n / 2;
  return (
    <svg className="hidden lg:block w-full h-full" viewBox={`0 0 100 ${n}`} preserveAspectRatio="none" aria-hidden>
      {Array.from({ length: n }).map((_, i) => {
        const y = i + 0.5;
        const d = dir === "in" ? `M0 ${y} C 55 ${y}, 45 ${mid}, 100 ${mid}` : `M0 ${mid} C 55 ${mid}, 45 ${y}, 100 ${y}`;
        return (
          <g key={i}>
            <path d={d} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <path d={d} fill="none" stroke="#02F5A1" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="tok-flow tok-keep" style={{ animationDelay: `${i * -0.18}s` }} />
          </g>
        );
      })}
    </svg>
  );
}

/** Confluent-style hub diagram: applications on the left, the governed gateway in the middle, providers on the right. */
export function IntegrationHub() {
  const [paused, setPaused] = useState(false);
  return (
    <div className={clsx(paused && "[&_.tok-flow]:[animation-play-state:paused] [&_.tok-pulse]:[animation-play-state:paused] [&_.tok-float]:[animation-play-state:paused]")}>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_14%_minmax(260px,320px)_14%_minmax(0,1fr)] gap-y-6 items-stretch">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-tertiary h-8">Your applications</p>
          <div className="grid gap-3 lg:grid-rows-6 lg:h-[420px] items-center">
            {APPS.map((a) => <Tile key={a.name} {...a} />)}
          </div>
        </div>
        <div className="hidden lg:block pt-8"><div className="h-[420px]"><Lines dir="in" /></div></div>

        <div className="lg:pt-8">
          <div className="relative rounded-2xl border border-accent-500/40 bg-ink-700/60 p-6 lg:h-[420px] flex flex-col items-center justify-center text-center">
            <span className="tok-pulse tok-keep absolute inset-0 rounded-2xl border border-accent-500/50" aria-hidden />
            <Image src="/brand/logo-dark.svg" alt="tok∑ner" width={140} height={44} />
            <p className="text-sm text-text-tertiary mt-3">One governed, OpenAI-compatible endpoint</p>
            <ul className="mt-6 grid grid-cols-2 gap-2 w-full text-[12px] text-text-inverse">
              {["Identity", "Policy", "Budgets", "Routing", "Documents", "Audit"].map((x) => (
                <li key={x} className="rounded-md border border-white/10 bg-white/5 py-1.5">{x}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="hidden lg:block pt-8"><div className="h-[420px]"><Lines dir="out" /></div></div>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-tertiary h-8">Model providers</p>
          <div className="grid gap-3 lg:grid-rows-6 lg:h-[420px] items-center">
            {MODELS.map((a) => <Tile key={a.name} {...a} />)}
          </div>
        </div>
      </div>

      <div className="mt-10 pt-8 border-t border-white/10">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-tertiary mb-4">Wired into the rest of your stack</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {AROUND.map((g, gi) => (
            <Link key={g.id} href={`/connectors#${g.id}`} className="group rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:border-accent-500/50 transition-colors">
              <p className="text-sm font-medium text-text-inverse">{g.label}</p>
              <div className="mt-3 flex gap-2">
                {byName(g.id, g.names).map((it, k) => (
                  <span
                    key={it.name}
                    title={it.name}
                    className="tok-float tok-keep h-9 w-9 rounded-md bg-white grid place-items-center"
                    style={{ animationDelay: `${(gi * 4 + k) * -0.45}s` }}
                  >
                    <NodeIcon icon={it.icon} size={20} />
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-inverse"
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}{paused ? "Play animation" : "Pause animation"}
        </button>
      </div>
    </div>
  );
}
