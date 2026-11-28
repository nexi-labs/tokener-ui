/** Display names for the industries that use cases are grouped under, in the order they are shown. */
export const INDUSTRY_LABELS: Record<string, string> = {
  knowledge: "RAG and retrieval",
  banking: "Banking",
  insurance: "Insurance",
  healthcare: "Healthcare",
  retail: "Retail",
  manufacturing: "Manufacturing",
  logistics: "Logistics",
  energy: "Energy and utilities",
  telecom: "Telecommunications",
  "public-sector": "Public sector",
  education: "Education",
  legal: "Legal and professional services",
  enterprise: "Enterprise",
  startups: "Startups",
};
export const INDUSTRY_ORDER = Object.keys(INDUSTRY_LABELS);
