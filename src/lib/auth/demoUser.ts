/**
 * Who the sample workspace is signed in as. One place, so the sidebar, the top bar and Account settings agree. The documentation screenshots set
 * sessionStorage "tok.demo.user" to a JSON {name, email} so they can show a different sample person without changing the sample data.
 */
const BASE = { name: "Nestor Martourez", email: "nestor@nexi.com" } as const;

function override(): { name?: string; email?: string } {
  try { return typeof sessionStorage === "undefined" ? {} : JSON.parse(sessionStorage.getItem("tok.demo.user") || "{}"); } catch { return {}; }
}

export const DEMO_USER = {
  get name(): string { return override().name || BASE.name; },
  get email(): string { return override().email || BASE.email; },
};
export const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
