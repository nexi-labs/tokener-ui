// Synthetic benchmark corpus. Every document is generated from a fixed seed, so a run is repeatable.
// These are shaped like what customers send (exports, API responses, web pages, scanned reports, mail
// threads, logs, contracts) but they are not customer data, and results on them are not a promise for
// any particular customer's documents.

export type CorpusDoc = { id: string; type: string; label: string; input: { text?: string; pages?: string[]; hint?: "html" | "json" | "csv" | "tsv" | "text" }; question?: string };

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)];
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const REGIONS = ["EMEA", "APAC", "North America", "LATAM"], STATUS = ["active", "active", "active", "churned", "paused"], PLANS = ["Enterprise", "Team", "Developer"];
const COMPANIES = ["Northwind", "Contoso", "Fabrikam", "Globex", "Initech", "Umbrella", "Hooli", "Stark", "Wayne", "Wonka", "Soylent", "Vandelay"];

function customersCsv(): string {
  const r = rng(11), rows = ["customer_id,company,region,plan,status,seats,mrr_usd,renewal_date,owner_email"];
  for (let i = 0; i < 80; i++) rows.push([`C-${10000 + i}`, `${pick(r, COMPANIES)} ${i}`, pick(r, REGIONS), pick(r, PLANS), pick(r, STATUS), String(5 + Math.floor(r() * 400)), `"${money(500 + r() * 40000)}"`, `2027-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`, `owner${i % 9}@tokener.example`].join(","));
  return rows.join("\n");
}

function apiJson(): string {
  const r = rng(23), items = [];
  for (let i = 0; i < 40; i++) items.push({ id: 5000 + i, sku: `SKU-${100 + i}`, title: `${pick(r, ["Steel", "Copper", "Carbon", "Oak"])} bracket ${i}`, price: Math.round(r() * 9000) / 100, currency: "USD", in_stock: r() > 0.3, warehouse: pick(r, ["AMS-1", "SIN-2", "IAD-3"]), updated_at: `2026-10-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}T09:00:00Z` });
  return JSON.stringify({ status: "ok", page: 1, total: 40, items }, null, 2);
}

function nestedJson(): string {
  const r = rng(29), orders = [];
  for (let i = 0; i < 12; i++) orders.push({ order: { id: `O-${7000 + i}`, customer: { id: `C-${10000 + i}`, tier: pick(r, PLANS) }, lines: [{ sku: `SKU-${100 + i}`, qty: 1 + Math.floor(r() * 5) }, { sku: `SKU-${200 + i}`, qty: 1 + Math.floor(r() * 3) }], total: Math.round(r() * 100000) / 100 } });
  return JSON.stringify({ orders }, null, 2);
}

const NAV = `<nav class="top"><ul><li><a href="/">Home</a></li><li><a href="/products">Products</a></li><li><a href="/pricing">Pricing</a></li><li><a href="/docs">Docs</a></li><li><a href="/blog">Blog</a></li><li><a href="/about">About</a></li><li><a href="/careers">Careers</a></li><li><a href="/contact">Contact</a></li></ul></nav>`;
const FOOT = `<footer><div class="cols"><div><h4>Company</h4><a href="/about">About</a><a href="/careers">Careers</a><a href="/press">Press</a></div><div><h4>Legal</h4><a href="/terms">Terms of service</a><a href="/privacy">Privacy policy</a><a href="/cookies">Cookie settings</a></div></div><p>Copyright 2026 Example Corp. All rights reserved.</p></footer>`;
function webPage(title: string, paras: string[]): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:sans-serif;margin:0}.top li{display:inline-block;padding:0 12px}.cols{display:flex}</style><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());</script></head><body>${NAV}<aside class="cookie-banner">We use cookies to improve your experience. <a href="/cookies">Manage</a></aside><main><article><h1>${title}</h1>${paras.map((p) => `<p>${p}</p>`).join("")}</article></main>${FOOT}</body></html>`;
}
function helpArticle(): string {
  return webPage("How refunds work", [
    "Refunds are issued to the original payment method within 14 days of an approved request. Card refunds can take a further 5 business days to appear on the statement.",
    "To request a refund, open the order in your account and choose Request refund. Quote the order number, for example order #88213, and the reason for the request.",
    "Orders placed more than 90 days ago are not eligible for a refund. Subscriptions can be cancelled at any time, and the cancellation takes effect at the end of the billing period.",
    "If your refund has not arrived after 20 days, contact support at help@example.com and include your order number. Our team replies within one business day.",
    "Digital goods are refundable only if they have not been downloaded. Gift cards are never refundable. Chargebacks filed while a refund is pending are handled as a single case.",
  ]);
}

function report(): string[] {
  const r = rng(37), pages: string[] = [];
  for (let p = 1; p <= 10; p++) {
    const lines = [`EXAMPLE CORP  |  Annual Report 2026`, `Confidential, do not distribute`];
    const body: string[] = [];
    for (let i = 0; i < 5; i++) body.push(`In segment ${p}.${i} the committee reviewed performance against plan and found that revenue of ${money(1 + r() * 90)}M was in line with expectations, supported by steady demand across the regions.`);
    const wrapped = body.join(" ").replace(/(.{1,72})(\s|$)/g, "$1\n").trimEnd().split("\n");
    pages.push([...lines, ...wrapped, `Page ${p} of 10`, `Example Corp, 1 Market Street`].join("\n"));
  }
  return pages;
}

function emailThread(): string {
  const sig = "\n\n--\nJordan Lee\nSenior Account Manager\nExample Corp\nThis email and any attachments are confidential and intended solely for the addressee. If you have received this email in error please notify the sender and delete it. Please consider the environment before printing this email.";
  const msgs = [
    ["Sam", "Hi Jordan, can you confirm the renewal price for contract CT-4471? We were quoted $48,500 last quarter."],
    ["Jordan", "Hi Sam, confirmed: $48,500 per year, invoice due 2026-12-15. Let me know if you need the order form."],
    ["Sam", "Thanks. Please send the order form to procurement@fabrikam.example and copy me."],
    ["Jordan", "Done, sent today. The order form reference is OF-9921."],
  ];
  let out = "";
  msgs.forEach(([who, text], i) => {
    out += `${i ? "\n\n" : ""}From: ${who}\nSubject: RE: Renewal CT-4471\n\n${text}${sig}`;
    if (i) out += "\n\nOn earlier messages, " + msgs.slice(0, i).map(([w, t]) => `${w} wrote: ${t}`).join(" ");
  });
  return out;
}

function logFile(): string {
  const r = rng(41), lines: string[] = [];
  for (let i = 0; i < 160; i++) {
    const t = `2026-10-30T10:${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}Z`;
    if (i % 9 === 0) lines.push(`${t} ERROR payment-service request_id=req-${1000 + i} status=502 upstream=ledger latency_ms=${2000 + Math.floor(r() * 900)}`);
    else { const l = `${t} INFO gateway request_id=req-${1000 + i} status=200 route=/v1/chat latency_ms=${80 + Math.floor(r() * 40)}`; lines.push(l); if (i % 5 === 0) for (let k = 0; k < 3; k++) lines.push(`${t} DEBUG health-check ok`); }
  }
  return lines.join("\n");
}

function contract(): string {
  const clause = (n: number) => `${n}. The Customer shall pay the Supplier the fees set out in the Order Form within thirty (30) days of the date of each invoice, and the Supplier shall provide the Services in accordance with the Service Level Agreement and the Data Processing Addendum.`;
  const paras = Array.from({ length: 14 }, (_, i) => clause(i + 1) + ` Any dispute arising under clause ${i + 1} shall be referred to the Chief Executive Officer of each party before either party may begin legal proceedings.`);
  return ["MASTER SERVICES AGREEMENT", ...paras, "Total annual fees are $120,000.00 payable in four instalments."].join("\n\n");
}

function ragChunks(): string {
  const base = [
    "The warranty period for all hardware products is 24 months from the date of delivery, and covers defects in materials and workmanship.",
    "Support is available on weekdays from 08:00 to 18:00 UTC, and critical incidents are handled around the clock.",
    "Customers on the Enterprise plan receive a named technical account manager and a quarterly business review.",
    "Data is encrypted at rest with AES-256 and in transit with TLS 1.3, and keys are rotated every 90 days.",
  ];
  const out: string[] = [];
  for (let i = 0; i < 12; i++) out.push(`[doc ${i + 1}] ${base[i % base.length]} ${i % 3 === 0 ? "See the product manual for details and exclusions." : ""}`);
  return out.join("\n\n");
}

function wiki(): string {
  return `# Onboarding guide

## Accounts

Every new starter gets an account on the first day. Ask your manager to raise a ticket with IT and quote your start date.

## Equipment

Laptops are shipped to your home address and arrive 2 days before your start date. If yours does not arrive, contact it-help@example.com.

## Benefits

* Health cover starts on day one
* 25 days paid leave
* Learning budget of $1,500 per year

## Meetings

| Meeting | Day | Time | Owner |
| --- | --- | --- | --- |
| Standup | Mon-Fri | 09:30 | Team lead |
| Planning | Monday | 10:00 | Product |
| Retro | Friday | 15:00 | Team lead |
| All hands | Thursday | 16:00 | CEO |
`;
}

export const CORPUS: CorpusDoc[] = [
  { id: "csv-customers", type: "Spreadsheet export", label: "Customer export, 80 rows", input: { text: customersCsv(), hint: "csv" } },
  { id: "json-catalog", type: "API response", label: "Product catalogue JSON, 40 records", input: { text: apiJson(), hint: "json" } },
  { id: "json-orders", type: "API response", label: "Nested orders JSON", input: { text: nestedJson(), hint: "json" } },
  { id: "html-help", type: "Web page", label: "Help centre article", input: { text: helpArticle(), hint: "html" }, question: "How long do refunds take?" },
  { id: "pdf-report", type: "Scanned or PDF report", label: "Annual report, 10 pages", input: { pages: report() }, question: "What did the committee conclude about revenue in segment 4.2?" },
  { id: "email-thread", type: "Email thread", label: "Renewal thread with quoted history", input: { text: emailThread() }, question: "What is the renewal price and due date?" },
  { id: "log", type: "Log file", label: "Gateway log, 200 lines", input: { text: logFile() }, question: "Which requests failed?" },
  { id: "contract", type: "Contract", label: "Services agreement, 14 clauses", input: { text: contract() }, question: "How many days does the customer have to pay?" },
  { id: "rag", type: "Retrieved chunks", label: "12 chunks from a vector search", input: { text: ragChunks() }, question: "What is the warranty period?" },
  { id: "wiki", type: "Wiki page", label: "Onboarding guide", input: { text: wiki() }, question: "When is the retro?" },
];
