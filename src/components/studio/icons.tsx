"use client";

import { useState } from "react";
import { Plug } from "lucide-react";
import { resolveIcon } from "@/lib/icons/collection";
import type { IconRef } from "./types";
import { FnIcon } from "@/components/functions/FnIcon";

/**
 * Renders an IconRef. Brand icons come from the `simple-icons` package where available and
 * fall back to https://cdn.simpleicons.org/<slug>/<hex> for brands the package lacks. If the
 * CDN is unreachable the lucide fallback glyph is shown, so a node never renders blank.
 */
export function NodeIcon({ icon, size = 18, className }: { icon: IconRef; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if ("ref" in icon) {
    const r = resolveIcon(icon.ref);
    if (!r) return <Plug size={size} className={className} strokeWidth={1.8} />;
    if (r.kind === "glyph") { const G = r.icon; return <G size={size} className={className} strokeWidth={1.8} aria-label={r.title} />; }
    return (
      <svg role="img" viewBox="0 0 24 24" width={size} height={size} className={className} fill={`#${r.hex}`} aria-label={r.title}>
        <path d={r.path} />
      </svg>
    );
  }
  if ("fn" in icon) return <FnIcon name={icon.fn} size={size} className={className} />;
  if ("svg" in icon) {
    return (
      <svg role="img" viewBox={icon.svg.viewBox} width={size} height={size} className={className} fill={icon.svg.hex ? `#${icon.svg.hex}` : "currentColor"} aria-label={icon.svg.title ?? "Connector icon"}>
        <path d={icon.svg.d} />
      </svg>
    );
  }
  if ("lucide" in icon) {
    const L = icon.lucide;
    return <L size={size} className={className} strokeWidth={1.8} />;
  }
  if ("si" in icon) {
    return (
      <svg role="img" viewBox="0 0 24 24" width={size} height={size} className={className} fill={`#${icon.si.hex}`} aria-label={icon.si.title}>
        <path d={icon.si.path} />
      </svg>
    );
  }
  if (failed) {
    const F = icon.fallback;
    return <F size={size} className={className} strokeWidth={1.8} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://cdn.simpleicons.org/${icon.cdn}${icon.hex ? `/${icon.hex}` : ""}`}
      alt={icon.cdn}
      width={size}
      height={size}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
