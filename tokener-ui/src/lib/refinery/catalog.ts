/**
 * References the recipe steps can point at. Functions are the serverless functions of the workspace; the entries here stand in for the real list
 * until the Refinery API reads it from the Functions module. Embedding and model aliases come from the gateway.
 */
export type FnRef = { id: string; name: string; runtime: string; blurb: string; input: string; output: string };
export const FUNCTIONS: FnRef[] = [
  { id: "fn_normalize_address", name: "normalize-address", runtime: "Python 3.12", blurb: "Splits and standardises postal addresses.", input: "address text", output: "JSON with street, city, postal code, country" },
  { id: "fn_detect_language", name: "detect-language", runtime: "Python 3.12", blurb: "Returns the language code and a confidence.", input: "text", output: "JSON with language and confidence" },
  { id: "fn_geocode_city", name: "geocode-city", runtime: "Node.js 22", blurb: "Looks up coordinates for a city name.", input: "city name", output: "JSON with latitude and longitude" },
  { id: "fn_extract_invoice", name: "extract-invoice-fields", runtime: "Python 3.12", blurb: "Reads invoice number, date and total from text.", input: "invoice text", output: "JSON with the extracted fields" },
  { id: "fn_redact_names", name: "redact-person-names", runtime: "Container image", blurb: "Finds and replaces person names with a label.", input: "text", output: "redacted text" },
];
export const FUNCTION_BY_ID = new Map(FUNCTIONS.map((f) => [f.id, f]));

export const EMBED_MODELS = [{ value: "alias:embedding", label: "embedding (default)" }, { value: "alias:embedding-large", label: "embedding-large" }];
