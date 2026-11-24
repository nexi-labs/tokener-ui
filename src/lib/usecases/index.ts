import { REGULATED } from "./regulated";
import { COMMERCE } from "./commerce";
import { OPERATIONS } from "./operations";
import { KNOWLEDGE } from "./knowledge";
import { PLATFORM } from "./platform";
import { FEATURES } from "./features";
import { FUNCTIONS_CASES } from "./functions";
import { REFINERY } from "./refinery";
import { PIPELINES } from "./pipelines";
import type { UseCase } from "./types";

export const USE_CASES: UseCase[] = [...KNOWLEDGE.filter((u) => u.industry === "knowledge"), ...FEATURES.filter((u) => u.industry === "knowledge"), ...REGULATED, ...COMMERCE, ...OPERATIONS, ...KNOWLEDGE.filter((u) => u.industry !== "knowledge"), ...PLATFORM, ...FEATURES.filter((u) => u.industry !== "knowledge"), ...FUNCTIONS_CASES, ...REFINERY];

export const bySlug = (slug: string) => USE_CASES.find((u) => u.slug === slug);
export const forIndustry = (industry: string) => USE_CASES.filter((u) => u.industry === industry);
/** The pipeline template id for a use case, when it has a runnable example. */
export const templateId = (slug: string) => (PIPELINES[slug] ? `uc-${slug}` : undefined);
/** Operator kinds a use case's example pipeline uses, in order, without repeats. */
export const operatorsOf = (slug: string): string[] => Array.from(new Set((PIPELINES[slug]?.nodes ?? []).map((n) => n[0])));
export const relatedTo = (u: UseCase, n = 3) => {
  const same = USE_CASES.filter((x) => x.slug !== u.slug && x.industry === u.industry);
  const rest = USE_CASES.filter((x) => x.slug !== u.slug && x.industry !== u.industry && x.tags.some((t) => u.tags.includes(t)));
  return [...same, ...rest].slice(0, n);
};
