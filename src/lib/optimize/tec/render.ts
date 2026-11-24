import { plainTable } from "./tables";
import type { Block } from "./types";

export type RenderCtx = { pageMarkers?: boolean; legend?: string };

/** Writes blocks back to text. A table is written in the form chosen for it, or as a plain table until a choice has been made. */
export function renderBlocks(blocks: Block[], ctx: RenderCtx = {}): string {
  const parts: string[] = [];
  let lastPage: number | undefined, i = 0;
  const mark = (b: Block, text: string) => { if (ctx.pageMarkers && b.page !== undefined && b.page !== lastPage) { lastPage = b.page; return `[p.${b.page}] ${text}`; } lastPage = b.page ?? lastPage; return text; };
  if (ctx.legend) parts.push(ctx.legend);
  while (i < blocks.length) {
    const b = blocks[i];
    let text = "";
    switch (b.kind) {
      case "heading": text = `${"#".repeat(b.level)} ${b.text}`; break;
      case "paragraph": text = b.quoted ? `> ${b.text}` : b.text; break;
      case "list": text = b.items.join("\n"); break;
      case "table": text = b.encoded?.text ?? plainTable(b.table); break;
      case "code": text = "```" + b.lang + "\n" + b.text + "\n```"; break;
      case "data": text = b.text; break;
      case "boiler": text = b.text; break;
      case "edge": {
        const group = [b.text]; let j = i + 1;
        while (j < blocks.length) { const n = blocks[j]; if (n.kind === "edge" && n.page === b.page && n.pos === b.pos) { group.push(n.text); j++; } else break; }
        text = group.join("\n"); i = j - 1; break;
      }
    }
    if (text !== "") parts.push(mark(b, text));
    i++;
  }
  return parts.join("\n\n");
}
