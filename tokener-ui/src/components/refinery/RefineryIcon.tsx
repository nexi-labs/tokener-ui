import type { LucideIcon } from "lucide-react";

/** The Refinery mark: three messy inputs converge into one clean stream. */
export function RefineryMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Refinery">
      <rect width="64" height="64" rx="15" fill="#07191E" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M14 17 L30 32 M14 32 H30 M14 47 L30 32" stroke="#C9D6D8" strokeWidth="3.2" /><path d="M30 32 H51" stroke="#02F5A1" strokeWidth="6.4" /></g>
      <circle cx="14" cy="17" r="2.6" fill="#C9D6D8" /><circle cx="14" cy="32" r="2.6" fill="#C9D6D8" /><circle cx="14" cy="47" r="2.6" fill="#C9D6D8" />
    </svg>
  );
}

/** The same shape as a line icon that takes the text colour, for menus. It has the same props as the icons from lucide-react. */
export const RefineryGlyph = (({ size = 24, className, strokeWidth = 2, ...rest }: { size?: number | string; className?: string; strokeWidth?: number | string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden {...rest}>
    <path d="M3.5 6 L11 12 M3.5 12 H11 M3.5 18 L11 12" strokeWidth={Number(strokeWidth) * 0.8} />
    <path d="M11 12 H20.5" strokeWidth={Number(strokeWidth) * 1.5} />
  </svg>
)) as unknown as LucideIcon;
