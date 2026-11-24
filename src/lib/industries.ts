import { CONNECTOR_GROUPS, SDK_LANGS } from "@/lib/connectors";
import type { IconRef } from "@/components/studio/types";

export type Brand = { name: string; icon: IconRef };

const ALL: Brand[] = [
  ...CONNECTOR_GROUPS.flatMap((g) => g.items.map((i) => ({ name: i.name, icon: i.icon }))),
  ...SDK_LANGS,
];

export const brand = (name: string): Brand => {
  const b = ALL.find((x) => x.name === name);
  if (!b) throw new Error(`Unknown brand "${name}" in industries.ts`);
  return b;
};
