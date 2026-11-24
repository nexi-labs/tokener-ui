import type { Block, DocPage, DocSection } from "./types";
import { START } from "./content/start";
import { GOVERNANCE } from "./content/governance";
import { AGENTS } from "./content/agents";
import { MODELS } from "./content/models";
import { CRUCIBLE } from "./content/crucible";
import { REFINERY } from "./content/refinery";
import { MLOPS } from "./content/mlops";
import { OBSERVABILITY } from "./content/observability";
import { ORGANIZATION } from "./content/organization";
import { DEVELOPER } from "./content/developer";
import { PLATFORM } from "./content/platform";

export const SECTIONS: DocSection[] = [START, GOVERNANCE, AGENTS, MODELS, CRUCIBLE, REFINERY, MLOPS, OBSERVABILITY, ORGANIZATION, DEVELOPER, PLATFORM].filter((s) => s.pages.length > 0);

export type Located = { section: DocSection; page: DocPage; href: string };

export const ALL: Located[] = SECTIONS.flatMap((section) => section.pages.map((page) => ({ section, page, href: `/docs/${section.id}/${page.slug}` })));

export function find(sectionId: string, slug: string): Located | undefined { return ALL.find((x) => x.section.id === sectionId && x.page.slug === slug); }

export function neighbours(href: string): { prev?: Located; next?: Located } {
  const i = ALL.findIndex((x) => x.href === href);
  return { prev: i > 0 ? ALL[i - 1] : undefined, next: i >= 0 && i < ALL.length - 1 ? ALL[i + 1] : undefined };
}

/** The headings of a page, for the "on this page" list. */
export function headings(page: DocPage): { id: string; text: string }[] {
  return page.blocks.filter((b): b is Extract<Block, { t: "h2" }> => b.t === "h2").map((b) => ({ id: slugify(b.text), text: b.text }));
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const textOf = (b: Block): string => {
  switch (b.t) {
    case "h2": case "h3": case "p": return b.text;
    case "list": return b.items.join(" ");
    case "steps": return b.items.map((i) => `${i.title} ${i.body}`).join(" ");
    case "callout": return `${b.title ?? ""} ${b.text}`;
    case "table": return [...b.head, ...b.rows.flat()].join(" ");
    case "cards": return b.items.map((i) => `${i.title} ${i.body}`).join(" ");
    case "walkthrough": return `${b.title} ${b.frames.map((f) => f.caption).join(" ")}`;
    default: return "";
  }
};

export type Hit = { href: string; title: string; section: string; snippet: string; score: number };

/** A small search over titles, summaries and text. Every word must appear; a title match counts most. */
export function search(q: string, limit = 8): Hit[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hits: Hit[] = [];
  for (const { section, page, href } of ALL) {
    const body = page.blocks.map(textOf).join(" ");
    const hay = `${page.title} ${page.summary} ${body}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) continue;
    const title = page.title.toLowerCase();
    let score = words.reduce((n, w) => n + (title.includes(w) ? 10 : 0) + (page.summary.toLowerCase().includes(w) ? 3 : 0) + 1, 0);
    const at = hay.indexOf(words[0]); const raw = `${page.summary} ${body}`; const i = Math.max(0, raw.toLowerCase().indexOf(words[0]) - 40);
    hits.push({ href, title: page.title, section: section.title, snippet: at < 0 ? page.summary : (i > 0 ? "..." : "") + raw.slice(i, i + 140), score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
