/** A node in a compact scene: [id, label, sub label, icon reference, core?]. Icon references are "l:Name" (lucide) or "b:Name" (brand or system). */
export type NodeSpec = [id: string, label: string, sub: string, icon: string, core?: boolean];

/**
 * A serialisable animated scene. Nodes are laid out by column, top to bottom. `flow` is the story told in order:
 *   "a>b"                    a packet travels from a to b
 *   "a>b|warn|masked"        the packet is amber and b shows the verdict "masked"
 *   "---"                    a pause before the next request starts
 * Tones are ok (default), warn, bad and info.
 */
export type SceneSpec = {
  cols: NodeSpec[][];
  flow: string[];
  alt: string;
  caption: string;
};

export type Section = { title: string; body: string[] };

export type UseCase = {
  slug: string;
  /** Industry slug from SOLUTIONS, or "knowledge" for the retrieval series. */
  industry: string;
  title: string;
  /** One or two sentences for cards and search. */
  summary: string;
  /** Short chips such as Retrieval, Agents, Payments. */
  tags: string[];
  /** The situation before tok∑ner, in a few paragraphs. */
  challenge: string[];
  /** How the work is built on the platform, in a few paragraphs. */
  solution: string[];
  /** Numbered walk through the run, one sentence each. */
  steps: { title: string; body: string }[];
  scene: SceneSpec;
  /** Systems around the pipeline, by display name. */
  systems: string[];
  /** Controls that make the workload safe to run. */
  controls: string[];
  /** What teams measure after launch. */
  measures: string[];
  /** A short, concrete example with numbers kept qualitative unless stated. */
  example: string;
  /** Existing console screenshot to show next to the pipeline. */
  console?: { src: string; url: string; caption: string };
  /** Optional extra sections for long articles. */
  extra?: Section[];
};
