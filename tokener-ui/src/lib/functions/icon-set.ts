/**
 * The tok∑ner Functions icon set. Plain data, so the console, the site diagrams and the scripts that export static SVG files all draw
 * the same glyphs. Every glyph is drawn on a 24 by 24 grid with a stroke and no fill, in the same weight and corner style as the rest of
 * the product icons, and uses currentColor so it follows the text colour of whatever it sits in.
 *
 * The set is the product's own vocabulary for the Functions area: it is not a copy of any cloud provider mark. The AWS Lambda connector
 * uses the provider's real brand icon, which lives in the connector catalogue and not here.
 */
export type FnIconName =
  | "function" | "http" | "event" | "schedule" | "workflow" | "ai" | "policy" | "cost" | "approval"
  | "connector" | "router" | "output" | "revision" | "trace" | "runtime" | "tokens";

export type Part = readonly [tag: "path" | "circle" | "rect", attrs: Readonly<Record<string, string | number>>];

export const FN_ICONS: Record<FnIconName, { label: string; meaning: string; parts: readonly Part[] }> = {
  function: {
    label: "Function", meaning: "A unit of business logic that runs under tok∑ner governance. Braces around the sigma mark.",
    parts: [
      ["path", { d: "M8.5 4C6.5 4 5.5 5 5.5 7v2.5c0 1.2-.8 2.1-2.2 2.5 1.4.4 2.2 1.3 2.2 2.5V17c0 2 1 3 3 3" }],
      ["path", { d: "M15.5 4c2 0 3 1 3 3v2.5c0 1.2.8 2.1 2.2 2.5-1.4.4-2.2 1.3-2.2 2.5V17c0 2-1 3-3 3" }],
      ["path", { d: "M14.2 8.5H9.8l2.8 3.5-2.8 3.5h4.4" }],
    ],
  },
  http: {
    label: "HTTP trigger", meaning: "An authenticated endpoint. A request arrives at the gate.",
    parts: [
      ["path", { d: "M3 12h10.5" }],
      ["path", { d: "M9.8 8.3 13.5 12l-3.7 3.7" }],
      ["path", { d: "M17.5 5v14" }],
      ["path", { d: "M17.5 5H21M17.5 19H21" }],
    ],
  },
  event: {
    label: "Event trigger", meaning: "A message or application event starts a run.",
    parts: [
      ["path", { d: "M13.2 2.8 6 13.2h5.3l-.9 8 7.6-11h-5.2z" }],
      ["path", { d: "M2.8 8.5h2M2.8 12h1.5M2.8 15.5h2" }],
    ],
  },
  schedule: {
    label: "Scheduled trigger", meaning: "A recurring schedule. A clock with a repeat mark.",
    parts: [
      ["circle", { cx: 12, cy: 12, r: 8 }],
      ["path", { d: "M12 7.5V12l3 2" }],
      ["path", { d: "M19.5 3.5v3.2h-3.2" }],
    ],
  },
  workflow: {
    label: "Workflow", meaning: "Steps composed into a process. Two branches join into one path.",
    parts: [
      ["circle", { cx: 5, cy: 6, r: 2 }],
      ["circle", { cx: 5, cy: 18, r: 2 }],
      ["circle", { cx: 19, cy: 12, r: 2 }],
      ["path", { d: "M7 6h3a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7" }],
      ["path", { d: "M13 12h4" }],
    ],
  },
  ai: {
    label: "AI call", meaning: "A model invocation through the gateway. A large and a small spark.",
    parts: [
      ["path", { d: "M11 3.5 12.9 9 18.5 11 12.9 13 11 18.5 9.1 13 3.5 11 9.1 9z" }],
      ["path", { d: "M18.5 15.5v4M16.5 17.5h4" }],
    ],
  },
  policy: {
    label: "Policy gate", meaning: "Policy is evaluated before the step runs. A shield with a check.",
    parts: [
      ["path", { d: "M12 3 5 6v5.5c0 4.4 3 7.8 7 9.5 4-1.7 7-5.1 7-9.5V6z" }],
      ["path", { d: "m8.8 12 2.2 2.2 4.2-4.4" }],
    ],
  },
  cost: {
    label: "Cost gate", meaning: "A spending limit on a run or a day. A gauge with a cap.",
    parts: [
      ["path", { d: "M4 16a8 8 0 0 1 16 0" }],
      ["path", { d: "m12 16 3.5-4.5" }],
      ["path", { d: "M3 20h18" }],
      ["path", { d: "M12 8V6.5M6.3 10.3 5.2 9.2M17.7 10.3l1.1-1.1" }],
    ],
  },
  approval: {
    label: "Human approval", meaning: "A person must approve before the run continues.",
    parts: [
      ["circle", { cx: 10.5, cy: 8, r: 3.2 }],
      ["path", { d: "M4 20a6.5 6.5 0 0 1 10.2-5.3" }],
      ["circle", { cx: 17.5, cy: 17, r: 4 }],
      ["path", { d: "m15.7 17 1.3 1.3 2.4-2.6" }],
    ],
  },
  connector: {
    label: "Connector", meaning: "A governed connection to another system.",
    parts: [
      ["path", { d: "M9 3v5M15 3v5" }],
      ["path", { d: "M6.5 8h11v3a5.5 5.5 0 0 1-11 0z" }],
      ["path", { d: "M12 16.5V21" }],
    ],
  },
  router: {
    label: "Conditional route", meaning: "The result decides which branch runs next.",
    parts: [
      ["path", { d: "M12 21v-7.5" }],
      ["path", { d: "M12 13.5 6 7M12 13.5 18 7" }],
      ["path", { d: "M6 10.5V7h3.5M18 10.5V7h-3.5" }],
    ],
  },
  output: {
    label: "Output", meaning: "The result is delivered to a downstream system.",
    parts: [
      ["path", { d: "M12 4v10" }],
      ["path", { d: "m8 10.5 4 4 4-4" }],
      ["path", { d: "M5 20h14M5 17v3M19 17v3" }],
    ],
  },
  revision: {
    label: "Revision", meaning: "An immutable version of a function. Stacked layers.",
    parts: [
      ["path", { d: "M12 3.5 3 8l9 4.5L21 8z" }],
      ["path", { d: "m3 12 9 4.5 9-4.5" }],
      ["path", { d: "m3 16 9 4.5 9-4.5" }],
    ],
  },
  trace: {
    label: "Execution trace", meaning: "The recorded timeline of one execution.",
    parts: [["path", { d: "M3 12h4l2.5-6 4 12 2.5-6h5" }]],
  },
  runtime: {
    label: "Runtime", meaning: "The language runtime and its resource limits.",
    parts: [
      ["rect", { x: 7, y: 7, width: 10, height: 10, rx: 1.5 }],
      ["path", { d: "M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" }],
    ],
  },
  tokens: {
    label: "Tokens", meaning: "Token consumption, stacked as coins.",
    parts: [
      ["path", { d: "M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z" }],
      ["path", { d: "M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" }],
      ["path", { d: "M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" }],
    ],
  },
};

export const FN_ICON_NAMES = Object.keys(FN_ICONS) as FnIconName[];

/** One glyph as an SVG fragment, for scripts that write static files and for the standalone diagrams. */
export function fnIconMarkup(name: FnIconName, attrs = ""): string {
  const parts = FN_ICONS[name].parts.map(([tag, a]) => `<${tag} ${Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(" ")}/>`).join("");
  return `<g ${attrs}>${parts}</g>`;
}
