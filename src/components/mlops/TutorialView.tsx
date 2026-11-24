"use client";

import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock, Coins, Database, ExternalLink, Layers, ShieldAlert, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { CodeBlock } from "@/components/mlops/Code";
import { Screenshot } from "@/components/site/ui";
import type { Tutorial } from "@/lib/mlops/tutorials";

const WARN_ICON = { Security: ShieldAlert, Cost: Coins, Data: Database } as const;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-lg font-semibold tracking-tight text-text-primary">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Shared by the console Learn pages and the public developer site. Pure presentation, no store access. */
export function TutorialView({ t, inConsole }: { t: Tutorial; inConsole?: boolean }) {
  const toc = [
    ["before", "Before you start"], ["steps", "Steps"], ["verify", "Verify"], ["expected", "Expected output"],
    ["cleanup", "Clean up"], ["troubleshooting", "Troubleshooting"], ["references", "Vendor references"],
  ];
  return (
    <article className="grid lg:grid-cols-[1fr_220px] gap-10">
      <div className="min-w-0 space-y-9">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{t.level}</Badge>
            <span className="inline-flex items-center gap-1 text-xs text-text-secondary"><Clock size={13} /> {t.minutes} min</span>
            <span className="inline-flex items-center gap-1 text-xs text-text-secondary"><Layers size={13} /> {t.versions.join(", ")}</span>
          </div>
          <p className="text-[15px] text-text-secondary mt-3 max-w-2xl">{t.summary}</p>
          {t.availability && (
            <div className="mt-4 rounded-md border border-border bg-surface-muted px-3.5 py-3 text-[13px] text-text-secondary">{t.availability}</div>
          )}
        </header>

        <Section id="before" title="Before you start">
          <ul className="space-y-1.5">
            {t.prerequisites.map((p) => <li key={p} className="flex gap-2 text-sm text-text-secondary"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-text-tertiary" />{p}</li>)}
          </ul>
          <div className="mt-4 space-y-2">
            {t.warnings.map((w) => {
              const I = WARN_ICON[w.kind] ?? AlertTriangle;
              return (
                <div key={w.text} className="flex gap-2.5 rounded-md border border-status-degraded/40 bg-[#FFF8EC] px-3.5 py-2.5 text-[13px] text-text-primary">
                  <I size={16} className="mt-0.5 shrink-0 text-status-degraded" /><span><span className="font-semibold">{w.kind}. </span>{w.text}</span>
                </div>
              );
            })}
          </div>
        </Section>

        <Section id="steps" title="Steps">
          <ol className="space-y-6">
            {t.steps.map((s, i) => (
              <li key={s.title} className="relative pl-10">
                <span className="absolute left-0 top-0 h-7 w-7 rounded-full border border-border-strong bg-surface text-[13px] font-semibold grid place-items-center" aria-hidden>{i + 1}</span>
                <h3 className="text-[15px] font-semibold text-text-primary leading-7"><span className="sr-only">Step {i + 1}: </span>{s.title}</h3>
                <p className="text-sm text-text-secondary mt-1 whitespace-pre-line">{s.body}</p>
                {s.code && <div className="mt-3"><CodeBlock code={s.code.text} language={s.code.lang} title={s.code.title} /></div>}
                {s.shot && <Screenshot src={s.shot.src} url={s.shot.url ?? "app.tokener.io"} alt={s.shot.alt} className="mt-3 max-w-3xl" />}
                {s.console && (
                  <div className="mt-3 flex gap-2 text-[13px] text-text-secondary rounded-md bg-surface-muted border border-border px-3 py-2.5">
                    <Terminal size={15} className="mt-0.5 shrink-0 text-text-tertiary" /><span><span className="font-medium text-text-primary">In the console. </span>{s.console}</span>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Section>

        <Section id="verify" title="Verify">
          <ul className="space-y-1.5 list-disc pl-5 text-sm text-text-secondary">{t.verification.map((v) => <li key={v}>{v}</li>)}</ul>
        </Section>

        <Section id="expected" title="Expected output"><p className="text-sm text-text-secondary">{t.expected}</p></Section>

        <Section id="cleanup" title="Clean up">
          <ul className="space-y-1.5 list-disc pl-5 text-sm text-text-secondary">{t.cleanup.map((v) => <li key={v}>{v}</li>)}</ul>
        </Section>

        <Section id="troubleshooting" title="Troubleshooting">
          <dl className="divide-y divide-border border border-border rounded-md">
            {t.troubleshooting.map((x) => (
              <div key={x.problem} className="px-3.5 py-3"><dt className="text-sm font-medium text-text-primary">{x.problem}</dt><dd className="text-sm text-text-secondary mt-0.5">{x.fix}</dd></div>
            ))}
          </dl>
        </Section>

        <Section id="references" title="Vendor references">
          <ul className="space-y-1.5">
            {t.references.map((r) => (
              <li key={r.url}><a href={r.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 text-sm text-text-primary underline underline-offset-2 decoration-border-strong hover:decoration-text-primary">{r.label}<ExternalLink size={12} /></a></li>
            ))}
          </ul>
          <p className="text-xs text-text-tertiary mt-3">Commands and versions are checked against the linked vendor documentation. Always read the current vendor page before running them against production.</p>
        </Section>

        {t.consoleLink && !inConsole && (
          <Link href={t.consoleLink.href} className="inline-flex items-center gap-1 text-sm font-medium text-text-primary underline underline-offset-2 decoration-border-strong hover:decoration-text-primary">{t.consoleLink.label}<ArrowUpRight size={14} /></Link>
        )}
      </div>

      <nav aria-label="On this page" className="hidden lg:block">
        <div className="sticky top-24 text-[13px]">
          <div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary mb-2">On this page</div>
          <ul className="space-y-1.5 border-l border-border">
            {toc.map(([id, label]) => <li key={id}><a href={`#${id}`} className="block pl-3 text-text-secondary hover:text-text-primary">{label}</a></li>)}
          </ul>
          {t.consoleLink && inConsole && (
            <Link href={t.consoleLink.href} className="mt-5 inline-flex items-center gap-1 text-text-primary underline underline-offset-2 decoration-border-strong hover:decoration-text-primary">{t.consoleLink.label}<ArrowUpRight size={13} /></Link>
          )}
        </div>
      </nav>
    </article>
  );
}
