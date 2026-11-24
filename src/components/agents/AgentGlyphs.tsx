import type { LucideIcon } from "lucide-react";

/**
 * The Agent OS icon set. Each glyph is drawn once as a base shape and an accent shape. In menus the whole glyph takes the text colour and has the same
 * props as an icon from lucide-react. As a mark (a tile for page headers) the base is light and the accent is the brand green.
 */
type Shapes = { base: React.ReactNode; accent: React.ReactNode };

const SHAPES: Record<string, Shapes> = {
  // A ring of agents around one that is watched.
  arena: {
    base: <><circle cx="12" cy="12" r="8.6" /><circle cx="12" cy="3.4" r="1.5" fill="currentColor" /><circle cx="4.55" cy="16.3" r="1.5" fill="currentColor" /><circle cx="19.45" cy="16.3" r="1.5" fill="currentColor" /></>,
    accent: <circle cx="12" cy="12" r="2.4" fill="currentColor" />,
  },
  // An anvil with a spark: agents are made here.
  forge: {
    base: <path d="M3.5 11 H16.5 C16.5 13.3 15 14.4 13.4 14.8 V16.6 H15.8 V19.4 H8.4 V16.6 H10.6 V14.8 C7 14.8 4 13.8 3.5 11 Z" />,
    accent: <path d="M18.5 3.8 V8 M16.4 5.9 H20.6" />,
  },
  // One coordinator, three agents it directs.
  conductor: {
    base: <><circle cx="12" cy="4.9" r="2" /><circle cx="4.8" cy="19" r="1.8" /><circle cx="12" cy="19" r="1.8" /><circle cx="19.2" cy="19" r="1.8" /></>,
    accent: <path d="M12 6.9 V12.2 M12 12.2 L5.5 17.3 M12 12.2 V17.2 M12 12.2 L18.5 17.3" />,
  },
  // Layers of a protocol stack, one of them live.
  protocols: {
    base: <><rect x="3.5" y="4.5" width="17" height="3.6" rx="1.2" /><rect x="3.5" y="15.9" width="17" height="3.6" rx="1.2" /></>,
    accent: <rect x="6.5" y="10.2" width="11" height="3.6" rx="1.2" />,
  },
  // A trace: spans in sequence.
  traces: {
    base: <path d="M4 5.5 H12 M8 12 H17 M13 18.5 H20" />,
    accent: <><circle cx="4" cy="5.5" r="1.3" fill="currentColor" /><circle cx="17" cy="12" r="1.3" fill="currentColor" /><circle cx="20" cy="18.5" r="1.3" fill="currentColor" /></>,
  },
};

export type GlyphName = keyof typeof SHAPES;

export function AgentGlyph({ name, size = 24, className, strokeWidth = 1.8 }: { name: GlyphName; size?: number | string; className?: string; strokeWidth?: number | string }) {
  const g = SHAPES[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {g.base}{g.accent}
    </svg>
  );
}

const glyph = (name: GlyphName) =>
  (({ size = 24, className, strokeWidth = 1.8, ...rest }: { size?: number | string; className?: string; strokeWidth?: number | string }) =>
    <AgentGlyph name={name} size={size} className={className} strokeWidth={strokeWidth} {...rest} />) as unknown as LucideIcon;

export const ArenaGlyph = glyph("arena");
export const ForgeGlyph = glyph("forge");
export const ConductorGlyph = glyph("conductor");
export const ProtocolsGlyph = glyph("protocols");
export const TracesGlyph = glyph("traces");

/** Colour tile for page headers and cards. */
export function AgentMark({ name, size = 36, label }: { name: GlyphName; size?: number; label?: string }) {
  const g = SHAPES[name];
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={label ?? name}>
      <rect width="48" height="48" rx="11" fill="#07191E" />
      <g transform="translate(9 9) scale(1.25)" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
        <g stroke="#C9D6D8" color="#C9D6D8">{g.base}</g>
        <g stroke="#02F5A1" color="#02F5A1">{g.accent}</g>
      </g>
    </svg>
  );
}
