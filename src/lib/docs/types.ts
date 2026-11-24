/**
 * The documentation is data: a list of sections, each with pages, each page a list of blocks. The site draws them, builds the navigation, the "on this page" list and the
 * search from the same data, so a page needs no layout work. Text inside a block may use **bold**, `code` and [label](href). A link that starts with /docs stays in the docs.
 *
 * Screenshots live in public/docs/shots/<name>.webp and are written by scripts/docs-shots.mjs from the manifests in scripts/docs-shots/. A block names a shot without the extension.
 */
export type Tone = "accent" | "ink" | "warn" | "muted";

export type DemoId = "request-path" | "budget-breach" | "policy-tester" | "promotion-gates" | "run-filter";

export type TreeNode = { label: string; sub?: string; children?: TreeNode[] };

export type Block =
  | { t: "h2"; text: string }
  | { t: "h3"; text: string }
  | { t: "p"; text: string }
  | { t: "list"; items: string[]; ordered?: boolean }
  /** A numbered how-to. A step may carry its own screenshot. */
  | { t: "steps"; items: { title: string; body: string; shot?: string; alt?: string }[] }
  | { t: "shot"; src: string; alt: string; caption?: string; narrow?: boolean }
  /** Screenshots shown one after another with previous and next, for a task that moves across screens. */
  | { t: "walkthrough"; title: string; frames: { shot: string; alt: string; caption: string }[] }
  | { t: "callout"; tone: "note" | "warn" | "sample"; title?: string; text: string }
  | { t: "table"; head: string[]; rows: string[][]; caption?: string }
  | { t: "code"; code: string; lang?: string; title?: string }
  | { t: "cards"; items: { title: string; body: string; href: string }[] }
  /** A chain of stages with an arrow between them. `alt` lists what can happen instead at that stage. */
  | { t: "flow"; steps: { label: string; sub?: string; tone?: Tone; alt?: string[] }[]; caption?: string; loop?: string }
  /** An architecture drawn as stacked layers. */
  | { t: "layers"; layers: { label: string; items: string[]; tone?: Tone }[]; caption?: string }
  | { t: "tree"; root: TreeNode; caption?: string }
  | { t: "demo"; id: DemoId };

export type DocPage = {
  slug: string;
  title: string;
  /** One or two sentences: what the feature is for. Shown under the title and in search. */
  summary: string;
  /** The console route this page is about, for the "Open in the console" button. */
  console?: string;
  /** Who can use it: the lowest role that can change things. */
  role?: "viewer" | "developer" | "approver" | "admin" | "operator";
  blocks: Block[];
};

export type DocSection = { id: string; title: string; blurb: string; pages: DocPage[] };
