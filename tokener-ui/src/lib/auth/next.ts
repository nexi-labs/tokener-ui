/** Only same-site paths may be used as a post sign-in destination, so a crafted link cannot send a person to another origin. */
export function safeNext(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/^\/(login|signup|auth|verify-email|reset-password|accept-invite)(\/|\?|$)/.test(raw)) return fallback;
  return raw;
}

const KEY = "tok.next";
export function rememberNext(next: string) { try { sessionStorage.setItem(KEY, next); } catch { /* storage unavailable */ } }
export function takeNext(): string {
  try { const v = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); return safeNext(v); } catch { return "/dashboard"; }
}
