/** Who the sample workspace is signed in as. One place, so the sidebar, the top bar and Account settings agree. */
export const DEMO_USER = { name: "Nestor Martourez", email: "nestor@nexi.com" } as const;
export const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
