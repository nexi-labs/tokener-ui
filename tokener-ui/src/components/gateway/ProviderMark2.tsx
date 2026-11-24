import { Cloud, Plug, Server, Wind } from "lucide-react";
import { SimpleIcon } from "@/components/icons/SimpleIcon";
import type { ProviderSpec } from "@/lib/gateway/provider-catalog";

/** Brand icon from simple-icons where one exists. Azure, Mistral and Cohere have none there, so a neutral glyph stands in rather than a lookalike. */
export function SpecMark({ spec, size = 40 }: { spec: Pick<ProviderSpec, "icon" | "glyph">; size?: number }) {
  const G = spec.glyph === "wind" ? Wind : spec.glyph === "plug" ? Plug : spec.glyph === "server" ? Server : Cloud;
  return (
    <div className="rounded-md bg-surface-muted flex items-center justify-center shrink-0" style={{ height: size, width: size }}>
      {spec.icon ? <SimpleIcon icon={spec.icon} size={size / 2} monochrome={false} /> : <G size={size / 2.2} className="text-text-secondary" />}
    </div>
  );
}
