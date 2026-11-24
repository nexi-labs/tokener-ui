import { FN_ICONS, type FnIconName } from "@/lib/functions/icon-set";

/** A tok∑ner Functions glyph. Follows the surrounding text colour; pass strokeWidth to match a heavier context. */
export function FnIcon({ name, size = 18, className, strokeWidth = 1.7, title }: { name: FnIconName; size?: number; className?: string; strokeWidth?: number; title?: string }) {
  const def = FN_ICONS[name];
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} role="img" aria-label={title ?? def.label}>
      {def.parts.map(([tag, a], i) => {
        const T = tag as "path";
        return <T key={i} {...(a as any)} />;
      })}
    </svg>
  );
}

/** The glyph on a rounded tile, as used in headers and the registry. */
export function FnTile({ name, size = 40, tone = "ink" }: { name: FnIconName; size?: number; tone?: "ink" | "accent" | "light" }) {
  const cls = tone === "ink" ? "bg-ink-800 text-accent-500 border-white/10" : tone === "accent" ? "bg-accent-500 text-ink-900 border-transparent" : "bg-surface-muted text-text-primary border-border";
  return (
    <span className={`inline-grid place-items-center rounded-lg border shrink-0 ${cls}`} style={{ width: size, height: size }}>
      <FnIcon name={name} size={Math.round(size * 0.55)} />
    </span>
  );
}
