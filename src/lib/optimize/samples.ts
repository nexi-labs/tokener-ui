import { CORPUS } from "./corpus";
/** Example inputs for the prompt inspector. They are fictional and exist only to show what each stage does. */
export type SamplePrompt = { id: string; label: string; note: string; question: string; text: string };

const orders = JSON.stringify(
  Array.from({ length: 8 }, (_, i) => ({ order_id: `ORD-${5200 + i}`, customer: ["Ada Obi", "Liam Chen", "Sofia Rossi", "Noor Khan"][i % 4], status: i % 3 === 0 ? "shipped" : "processing", total_usd: Number((40 + i * 13.25).toFixed(2)), currency: "USD" })),
  null, 2,
);

export const SAMPLE_PROMPTS: SamplePrompt[] = [
  {
    id: "support-email",
    label: "Support email thread",
    note: "A quoted reply chain with signatures and footers.",
    question: "Has the refund for order 5521 been approved, and when will it arrive?",
    text: `Hi team,

Please   check   the refund for order 5521. The customer paid 129.90 USD on 2026-09-14 and says the item arrived damaged.

Thanks,
Jane Doe
Customer Care
+44 20 7946 0958

--
Sent from my phone

This email and any attachments are confidential and intended only for the named recipient.

On Tue, Sep 22, Mark Lee wrote:
Hi Jane,

Please   check   the refund for order 5521. The customer paid 129.90 USD on 2026-09-14 and says the item arrived damaged.

Refund REF-88310 was approved on 2026-09-23 and is paid out in 5 to 7 business days to the original card.

Regards,
Mark Lee
Billing

To unsubscribe from these notifications, click here.`,
  },
  {
    id: "orders-json",
    label: "Orders API response",
    note: "Pretty-printed JSON with the same keys on every record.",
    question: "Which orders are still processing and what is their total?",
    text: `Here is the response from the orders API:\n\n${orders}\n\nSummarise anything unusual.`,
  },
  {
    id: "web-page",
    label: "Scraped web page",
    note: "HTML with scripts, styles and navigation markup.",
    question: "What is the price of the Pro plan and what does it include?",
    text: `<html><head><style>.nav{color:#333}</style><script>window.dataLayer=[];</script></head><body>
<div class="nav"><ul><li><a href="https://example.com/">Home</a></li><li><a href="https://example.com/pricing">Pricing</a></li></ul></div>
<h1>Pricing</h1>
<p>The Pro plan costs <b>49 USD</b> per seat each month and includes 5 workspaces and 100 GB of storage.</p>
<p>Support is available on weekdays between 09:00 and 17:00 UTC.</p>
<!-- tracking pixel -->
<div class="footer"><p>Copyright 2026 Example Ltd. All rights reserved.</p></div>
</body></html>`,
  },
  {
    id: "rag-context",
    label: "Retrieved documents",
    note: "Three overlapping passages from a RAG index.",
    question: "How long do customers have to return an item, and who pays for shipping?",
    text: `Source A. Our store opened in 2011 and now serves customers in 14 countries. Returns are accepted within 30 days of delivery for unused items in original packaging. The return label is free for faulty goods. Gift cards are not refundable. Our warehouse is located in Rotterdam and ships on weekdays.

Source B. Our store opened in 2011 and now serves customers in 14 countries. Returns are accepted within 30 days of delivery for unused items in original packaging. Customers pay return shipping for change of mind, deducted from the refund at 6.95 EUR. Our warehouse is located in Rotterdam and ships on weekdays.

Source C. The company newsletter is sent each month. Our team enjoys the annual summer picnic. Refunds go back to the original payment method within 5 business days of the item reaching the warehouse. Contact support at help@example.com for questions.`,
  },
  {
    id: "long-report",
    label: "Long report",
    note: "Narrative text where only a few sentences matter to the question.",
    question: "What was the refund policy for returns and how did customer retention change?",
    text: `The regional office opened in 2014 and has grown steadily since then. Staff satisfaction surveys are run twice a year by the people team. The leadership group meets weekly to review priorities and open risks. Total revenue for the year was 18.4 million EUR, up 6% on the previous year. The canteen was redecorated and now offers a wider choice at lunch. Customer complaints fell to 212 cases from 305 the year before. Several teams moved to the new floor after the refurbishment was completed. The annual summer picnic took place in the park near the main entrance. Service credits of 41,500 EUR were paid out under contract SLA-2291.\n\nA new parking arrangement was agreed with the neighbouring building. The average time to resolve a support case was 3.2 days. Employees were invited to join volunteering days throughout the year. The data centre migration finished on 2026-06-30 without unplanned downtime. Office plants were added to meeting rooms and shared areas. Operating costs rose to 14.1 million EUR, mainly because of energy prices. A cycling club was started by colleagues from the finance team. The security audit found 4 medium findings, all closed by 2026-09-15. Coffee machines were replaced on all floors in the spring.\n\nThe board approved a hiring plan of 35 roles for the coming year. Newsletters were redesigned to be shorter and easier to read. The refund policy was updated so that returns are accepted within 30 days. Visitors now register at the front desk using a tablet. Training hours per employee reached 27, against a target of 24. The company chess tournament had record participation this autumn. Customer retention stood at 94.5% at the end of the period. Recycling bins were added next to every printer.`,
  },
  {
    id: "csv-export",
    label: "Spreadsheet export (CSV)",
    note: "80 rows. The table is written in whichever form costs the fewest tokens, and each form is checked by reading it back.",
    question: "",
    text: CORPUS.find((d) => d.id === "csv-customers")!.input.text!,
  },
  {
    id: "pdf-report",
    label: "PDF report (10 pages)",
    note: "Text as a PDF extractor returns it, with the running header, footer and page number on every page and lines broken mid-sentence. Pages are separated by form feed characters.",
    question: "What did the committee conclude about revenue in segment 4.2?",
    text: CORPUS.find((d) => d.id === "pdf-report")!.input.pages!.join("\f"),
  },
  {
    id: "contract",
    label: "Contract with repeated terms",
    note: "Clauses that repeat the same long phrases. Repeated phrases are defined once.",
    question: "How many days does the customer have to pay?",
    text: CORPUS.find((d) => d.id === "contract")!.input.text!,
  },
];
