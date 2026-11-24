import codes from "./countries.generated.json";

export type Country = { code: string; name: string };

/**
 * The countries a person can choose when signing up. The codes come from the server (scripts/export-iam-roles.sh keeps them identical to what
 * the API accepts); the names come from the browser's own locale data, so they read naturally in the person's language.
 */
export function countries(locale?: string): Country[] {
  let names: Intl.DisplayNames | null = null;
  try { names = new Intl.DisplayNames(locale ? [locale, "en"] : ["en"], { type: "region" }); } catch { /* unsupported locale: fall back to the code */ }
  const out = (codes as string[]).map((code) => ({ code, name: names?.of(code) ?? code }));
  return out.sort((a, b) => a.name.localeCompare(b.name, locale));
}
