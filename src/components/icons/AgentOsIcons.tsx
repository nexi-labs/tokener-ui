import { forwardRef, type SVGProps } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Icons for the three ideas at the centre of Agent OS. They share the grid and stroke of the rest of the icon set (24 px, round caps),
 * and are typed as Lucide icons so they drop into the navigation and the cards that already take one.
 *
 *  - AgentNetworkIcon: a shield (the boundary) around three connected agents.
 *  - AgentMeshIcon: five agents in a ring with the handoffs between them.
 *  - ConstellationIcon: stars joined into a map, with the orbit that holds them.
 */
type P = SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string; absoluteStrokeWidth?: boolean };

function make(name: string, body: React.ReactNode): LucideIcon {
  const C = forwardRef<SVGSVGElement, P>(({ size = 24, strokeWidth = 1.75, absoluteStrokeWidth, className, ...rest }, ref) => (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" focusable="false" {...rest}>
      {body}
    </svg>
  ));
  C.displayName = name;
  return C as unknown as LucideIcon;
}

export const AgentNetworkIcon = make("AgentNetworkIcon", (
  <>
    <path d="M12 2.6 19.8 5.6v6c0 4.6-3.3 8.2-7.8 9.8-4.5-1.6-7.8-5.2-7.8-9.8v-6L12 2.6Z" />
    <path d="M8.8 9.2h6.4L12 14.8 8.8 9.2Z" />
    <circle cx="8.8" cy="9.2" r="1.45" fill="currentColor" stroke="none" />
    <circle cx="15.2" cy="9.2" r="1.45" fill="currentColor" stroke="none" />
    <circle cx="12" cy="14.8" r="1.45" fill="currentColor" stroke="none" />
  </>
));

export const AgentMeshIcon = make("AgentMeshIcon", (
  <>
    <path d="M12 4.2 19.2 9.4 16.4 18H7.6L4.8 9.4 12 4.2Z" />
    <path d="M12 4.2 7.6 18M12 4.2 16.4 18M4.8 9.4h14.4M4.8 9.4 16.4 18M19.2 9.4 7.6 18" opacity=".38" />
    <circle cx="12" cy="4.2" r="1.9" fill="currentColor" stroke="none" />
    <circle cx="19.2" cy="9.4" r="1.9" fill="currentColor" stroke="none" />
    <circle cx="16.4" cy="18" r="1.9" fill="currentColor" stroke="none" />
    <circle cx="7.6" cy="18" r="1.9" fill="currentColor" stroke="none" />
    <circle cx="4.8" cy="9.4" r="1.9" fill="currentColor" stroke="none" />
  </>
));

export const ConstellationIcon = make("ConstellationIcon", (
  <>
    <ellipse cx="12" cy="12" rx="9.4" ry="4.6" transform="rotate(-28 12 12)" opacity=".4" />
    <path d="M5 16.5 9.2 9.6 14.6 13.2 19 6.4M14.6 13.2l1.9 5" />
    <circle cx="5" cy="16.5" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="9.2" cy="9.6" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="14.6" cy="13.2" r="2.1" fill="currentColor" stroke="none" />
    <circle cx="19" cy="6.4" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="16.5" cy="18.2" r="1.3" fill="currentColor" stroke="none" />
  </>
));
