import Link from "next/link";
import Image from "next/image";
import clsx from "clsx";
import { ArrowRight } from "lucide-react";

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={clsx("mx-auto w-full max-w-[1520px] px-4 sm:px-6 lg:px-10 xl:px-14", className)}>{children}</div>;
}

export function Eyebrow({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <p className={clsx("font-mono text-[11px] uppercase tracking-[0.16em] mb-4", dark ? "text-accent-500" : "text-accent-700")}>
      {children}
    </p>
  );
}

export function H2({ children, dark, className }: { children: React.ReactNode; dark?: boolean; className?: string }) {
  return (
    <h2 className={clsx("text-[1.9rem] sm:text-[2.4rem] leading-[1.12] font-semibold tracking-[-0.02em] max-w-3xl", dark ? "text-text-inverse" : "text-text-primary", className)}>
      {children}
    </h2>
  );
}

export function Lead({ children, dark, className }: { children: React.ReactNode; dark?: boolean; className?: string }) {
  return <p className={clsx("text-base sm:text-lg leading-relaxed max-w-2xl mt-4", dark ? "text-text-tertiary" : "text-text-secondary", className)}>{children}</p>;
}

type BtnVariant = "accent" | "ink" | "ghost-dark" | "outline";

export function LinkButton({
  href, children, variant = "accent", className, arrow,
}: { href: string; children: React.ReactNode; variant?: BtnVariant; className?: string; arrow?: boolean }) {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex items-center justify-center gap-2 h-11 px-5 rounded-md text-sm font-semibold transition-colors whitespace-nowrap",
        variant === "accent" && "bg-accent-500 text-ink-900 hover:bg-accent-300",
        variant === "ink" && "bg-ink-800 text-text-inverse hover:bg-ink-700",
        variant === "ghost-dark" && "border border-white/25 text-text-inverse hover:bg-white/10",
        variant === "outline" && "border border-border-strong text-text-primary hover:bg-surface-muted",
        className
      )}
    >
      {children}
      {arrow && <ArrowRight size={15} />}
    </Link>
  );
}

export function TextLink({ href, children, dark }: { href: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <Link href={href} className={clsx("inline-flex items-center gap-1.5 text-sm font-semibold group", dark ? "text-accent-500" : "text-ink-800")}>
      <span className="border-b border-current/30 group-hover:border-current">{children}</span>
      <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Real console screenshot inside a neutral browser frame. */
export function Screenshot({
  src, url, alt, priority, className, width = 2160, height = 1350,
}: { src: string; url: string; alt: string; priority?: boolean; className?: string; width?: number; height?: number }) {
  return (
    <figure className={clsx("rounded-xl overflow-hidden border border-border-strong bg-surface shadow-popover", className)}>
      <div className="flex items-center gap-3 h-9 px-3.5 bg-surface-muted border-b border-border">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        </div>
        <div className="flex-1 max-w-sm mx-auto h-5 rounded bg-surface text-[11px] text-text-tertiary font-mono flex items-center justify-center truncate px-2">
          {url}
        </div>
        <div className="w-10 hidden sm:block" />
      </div>
      <Image src={src} alt={alt} width={width} height={height} priority={priority} unoptimized className="w-full h-auto block" />
    </figure>
  );
}

export function PageHero({
  eyebrow, title, lead, children,
}: { eyebrow: string; title: string; lead?: string; children?: React.ReactNode }) {
  return (
    <section className="bg-ink-800 relative overflow-hidden">
      <GridBackdrop />
      <Container className="relative py-16 sm:py-24">
        <Eyebrow dark>{eyebrow}</Eyebrow>
        <h1 className="text-[2.2rem] sm:text-5xl leading-[1.08] font-semibold tracking-[-0.025em] text-text-inverse max-w-3xl">{title}</h1>
        {lead && <Lead dark>{lead}</Lead>}
        {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
      </Container>
    </section>
  );
}

export function GridBackdrop() {
  // Faint grid plus a few "requests" that travel along its lines forever. Positions are fixed so server and client markup match.
  const lanes = [
    { top: 112, delay: 0, dur: 9, w: 120 },
    { top: 224, delay: -4, dur: 11, w: 90 },
    { top: 336, delay: -7, dur: 8, w: 140 },
    { top: 168, delay: -2.5, dur: 13, w: 100 },
  ];
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(#02F5A1 1px, transparent 1px), linear-gradient(90deg, #02F5A1 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "linear-gradient(to bottom, black, transparent 85%)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent 85%)",
        }}
      />
      <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
        {lanes.map((l, i) => (
          <span key={i} className="tok-packet tok-keep absolute left-0 h-px" style={{ top: l.top, width: l.w, animationDuration: `${l.dur}s`, animationDelay: `${l.delay}s` }} />
        ))}
      </div>
    </>
  );
}

export function CtaBand({
  title = "Put every AI request under control.",
  lead = "Start with the free Developer plan, or talk to us about a dedicated deployment.",
}: { title?: string; lead?: string }) {
  return (
    <section className="bg-ink-800 relative overflow-hidden">
      <GridBackdrop />
      <Container className="relative py-16 sm:py-20 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
        <div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em] text-text-inverse max-w-xl leading-tight">{title}</h2>
          <p className="text-text-tertiary mt-3 max-w-lg">{lead}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <LinkButton href="/signup" arrow>Get started free</LinkButton>
          <LinkButton href="/demo" variant="ghost-dark">Book a demo</LinkButton>
        </div>
      </Container>
    </section>
  );
}
