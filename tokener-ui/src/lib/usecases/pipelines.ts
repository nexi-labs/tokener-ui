/**
 * Example pipelines for the use cases that have one. Pure data, so the site can read it without loading the console.
 * Each node is [operator kind, display name, config overrides]; each link connects two nodes by index and the ports are
 * chosen by type, exactly as the builder does when you drop one node onto another.
 */
export type Sketch = { nodes: [kind: string, name: string, config?: Record<string, unknown>][]; links: [from: number, to: number][] };

const READ = { effect: "Reads only" };
const CHANGE = { effect: "Changes data", requireApproval: true };

/** Ingest, store, embed, index, retrieve, serve and observe. */
const retrieval = (docs: string, collection: string, service: string): Sketch => ({
  nodes: [
    ["ingest_documents", docs],
    ["store_documents", "Store"],
    ["chunk_embed", "Chunk and embed"],
    ["vector_index", "Vector index", { collection }],
    ["retrieve", "Retrieve"],
    ["agent_service", "Serve agent", { name: service }],
    ["monitor", "Observe"],
  ],
  links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
});

/** Read documents, have a model draft from them, wait for a person, then change a system. */
const draftAndApprove = (docs: string, store: string, ask: string, approver: string, act: string): Sketch => ({
  nodes: [
    ["ingest_documents", docs],
    ["store_documents", store],
    ["llm_step", ask],
    ["approval_gate", approver],
    ["mcp_tool", act, CHANGE],
  ],
  links: [[0, 1], [1, 2], [2, 3], [2, 4], [3, 4]],
});

/** Read through a tool, have a model propose, wait for a person, then change a system. */
const toolAgent = (read: string, ask: string, approver: string, act: string): Sketch => ({
  nodes: [
    ["mcp_tool", read, READ],
    ["llm_step", ask],
    ["approval_gate", approver],
    ["mcp_tool", act, CHANGE],
  ],
  links: [[0, 1], [1, 2], [1, 3], [2, 3]],
});

/** Promote an approved model with a canary, verification and a rollback path. */
const rollout = (model: string, approver: string, canary: string): Sketch => ({
  nodes: [
    ["registry_model", model],
    ["approval_gate", approver],
    ["canary_rollout", canary],
    ["verify_endpoint", "Verify"],
    ["promote", "Promote"],
    ["rollback", "Roll back"],
    ["notify", "Notify"],
  ],
  links: [[0, 1], [0, 2], [1, 2], [2, 3], [2, 4], [3, 4], [2, 5], [4, 6]],
});

const streamBriefing = (stream: string, topic: string, ask: string, page: string): Sketch => ({
  nodes: [
    ["stream_source", stream, { topic }],
    ["llm_step", ask],
    ["notify", page],
  ],
  links: [[0, 1], [1, 2]],
});

export const PIPELINES: Record<string, Sketch> = {
  "banking-kyc-document-review": draftAndApprove("KYC files", "Canonical documents", "Summarise against the checklist", "Analyst approval", "Update the case"),
  "banking-fraud-analyst-assistant": {
    nodes: [
      ["git_source", "Model source"],
      ["build_image", "Build on the bank's agent"],
      ["validate_artifact", "Scan and validate"],
      ["register_model", "Register"],
      ["approval_gate", "Second person approves"],
      ["canary_rollout", "Canary on the GPU cluster"],
      ["verify_endpoint", "Verify"],
      ["promote", "Promote"],
      ["rollback", "Roll back"],
      ["notify", "Notify"],
    ],
    links: [[0, 1], [1, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 5], [5, 6], [5, 7], [6, 7], [5, 8], [7, 9]],
  },
  "insurance-claims-intake": draftAndApprove("Claim files", "Canonical documents", "Summarise the claim", "Adjuster approval", "Update the claim"),
  "insurance-underwriting-summaries": {
    nodes: [
      ["ingest_documents", "Submission files"],
      ["store_documents", "Store"],
      ["chunk_embed", "Chunk and embed"],
      ["vector_index", "Vector index", { collection: "submission" }],
      ["retrieve", "Retrieve per question"],
      ["llm_step", "Answer the worksheet"],
      ["approval_gate", "Underwriter signs"],
    ],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
  },
  "insurance-premium-collection": {
    nodes: [
      ["schedule_trigger", "Weekdays 09:00"],
      ["time_window", "Business hours"],
      ["mcp_tool", "Read overdue policies", READ],
      ["llm_step", "Draft reminders"],
      ["approval_gate", "Approve the batch"],
      ["payment_request", "Overdue premium"],
      ["pay_mtn_momo", "Collect with MTN MoMo"],
      ["send_sms", "Text the link"],
      ["await_payment", "Wait for payment"],
      ["notify", "Tell collections"],
    ],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [5, 6], [6, 7], [6, 8], [4, 7], [8, 9]],
  },
  "healthcare-clinical-summaries": draftAndApprove("Encounter records", "Masked canonical record", "Draft the summary", "Clinician approval", "Write to the chart"),
  "healthcare-prior-authorization": {
    nodes: [
      ["ingest_documents", "Payer criteria"],
      ["store_documents", "Store"],
      ["chunk_embed", "Chunk and embed"],
      ["vector_index", "Vector index", { collection: "payer_criteria" }],
      ["retrieve", "Retrieve criteria"],
      ["llm_step", "Match evidence and draft the letter"],
      ["approval_gate", "Coordinator approves"],
      ["mcp_tool", "Save the packet", CHANGE],
    ],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [5, 7], [6, 7]],
  },
  "healthcare-appointment-outreach": {
    nodes: [
      ["schedule_trigger", "Daily 15:00"],
      ["time_window", "Clinic hours"],
      ["calendar_read", "Tomorrow's appointments"],
      ["llm_step", "Draft the reminders"],
      ["approval_gate", "Front desk approves"],
      ["send_sms", "Send the reminders"],
    ],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [3, 5], [4, 5]],
  },
  "retail-pay-by-link": {
    nodes: [
      ["payment_request", "Order received"],
      ["pay_card", "Collect by card"],
      ["send_sms", "Text the link"],
      ["await_payment", "Wait for payment"],
      ["notify", "Start fulfilment"],
      ["notify", "Flag for a person"],
    ],
    links: [[0, 1], [1, 2], [1, 2], [1, 3], [3, 4], [3, 5]],
  },
  "retail-product-content": {
    nodes: [
      ["mcp_resource", "Read product facts"],
      ["llm_step", "Draft descriptions"],
      ["approval_gate", "Editor approves"],
      ["mcp_tool", "Publish to the storefront", CHANGE],
    ],
    links: [[0, 1], [1, 2], [1, 3], [2, 3]],
  },
  "logistics-exception-desk": {
    nodes: [
      ["email_inbox", "Carrier notices"],
      ["llm_step", "Match the shipment and draft"],
      ["approval_gate", "Dispatcher approves"],
      ["send_email", "Send to the customer", { to: "customer@example.com" }],
    ],
    links: [[0, 1], [1, 2], [1, 3], [2, 3]],
  },
  "logistics-customs-documents": draftAndApprove("Trade documents", "Canonical documents", "Extract and cross-check", "Broker review", "File the declaration"),
  "logistics-depot-edge-models": rollout("Approved model", "Central approval", "Canary at the first depot"),
  "telecom-incident-triage": streamBriefing("Alarm stream", "alarms.core", "Write the incident briefing", "Page the on-call engineer"),
  "telecom-bill-dispute-handling": toolAgent("Read invoice lines", "Explain the bill", "Agent reviews the dispute", "Issue a credit"),
  "manufacturing-technician-copilot": retrieval("Manuals and work orders", "plant_manuals", "technician-copilot"),
  "manufacturing-plant-model-rollout": rollout("Approved model", "Quality approval", "Canary at one plant"),
  "manufacturing-quality-inspection-reports": {
    nodes: [
      ["schedule_trigger", "Shift end"],
      ["mcp_tool", "Read inspection data", READ],
      ["llm_step", "Draft the report"],
      ["approval_gate", "Quality engineer signs"],
      ["notify", "Post to the plant channel"],
    ],
    links: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  "energy-procedure-assistant": {
    nodes: [
      ["schedule_trigger", "Nightly 02:00"],
      ["mcp_resource", "Document control export"],
      ["store_documents", "Store"],
      ["chunk_embed", "Chunk and embed"],
      ["vector_index", "Vector index", { collection: "procedures" }],
      ["retrieve", "Retrieve"],
      ["agent_service", "Serve agent", { name: "procedure-assistant" }],
      ["monitor", "Observe"],
    ],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]],
  },
  "energy-alarm-briefing": streamBriefing("Alarm historian", "alarms.ops", "Write the alarm briefing", "Notify the on-call engineer"),
  "energy-regulatory-filing-prep": {
    nodes: [
      ["mcp_tool", "Read operating figures", READ],
      ["mcp_resource", "Read prior filings"],
      ["llm_step", "Draft the narrative"],
      ["approval_gate", "Engineering approves"],
      ["approval_gate", "Finance approves"],
      ["approval_gate", "Legal approves"],
      ["mcp_tool", "Store the filing package", CHANGE],
    ],
    links: [[0, 2], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [5, 6]],
  },
  "public-citizen-service-assistant": retrieval("Official guidance", "guidance", "citizen-assistant"),
  "public-oversight-reporting": {
    nodes: [
      ["schedule_trigger", "Monthly"],
      ["mcp_tool", "Run approved report queries", READ],
      ["llm_step", "Write the commentary"],
      ["approval_gate", "Accountable officer approves"],
      ["mcp_tool", "Store the report", CHANGE],
    ],
    links: [[0, 1], [1, 2], [2, 3], [2, 4], [3, 4]],
  },
  "public-permit-application-review": {
    nodes: [
      ["ingest_documents", "Permit requirements"],
      ["store_documents", "Store"],
      ["chunk_embed", "Chunk and embed"],
      ["vector_index", "Vector index", { collection: "permit_requirements" }],
      ["retrieve", "Retrieve requirements"],
      ["ingest_documents", "Application files"],
      ["llm_step", "Check the application"],
      ["approval_gate", "Case officer approves"],
      ["send_email", "Message the applicant", { to: "applicant@example.com" }],
    ],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 6], [5, 6], [6, 7], [6, 8], [7, 8]],
  },
  "education-course-tutor": retrieval("Course readings", "course_readings", "course-tutor"),
  "education-admissions-advising": {
    nodes: [
      ["mcp_tool", "Read the student's own record", READ],
      ["llm_step", "Answer the question"],
      ["approval_gate", "Adviser approves exceptions"],
      ["send_email", "Reply to the student", { to: "student@example.com" }],
    ],
    links: [[0, 1], [1, 2], [1, 3], [2, 3]],
  },
  "education-research-assistant": retrieval("Licensed papers", "literature", "research-assistant"),
  "legal-contract-review": draftAndApprove("Contracts", "Canonical documents", "Extract clauses and compare with the playbook", "Supervising lawyer approves", "Update the matter file"),
  "legal-due-diligence-data-room": {
    nodes: [
      ["schedule_trigger", "Daily 02:00"],
      ["mcp_resource", "Read the data room"],
      ["store_documents", "Store"],
      ["chunk_embed", "Chunk and embed"],
      ["vector_index", "Matter collection", { collection: "matter_0412" }],
      ["retrieve", "Retrieve"],
      ["agent_service", "Serve agent", { name: "diligence-assistant" }],
      ["monitor", "Observe"],
    ],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]],
  },
  "legal-research-memos": {
    nodes: [
      ["ingest_documents", "Source set"],
      ["store_documents", "Store"],
      ["chunk_embed", "Chunk and embed"],
      ["vector_index", "Vector index", { collection: "authorities" }],
      ["retrieve", "Retrieve passages"],
      ["llm_step", "Draft the memo"],
      ["approval_gate", "Associate verifies"],
      ["approval_gate", "Partner approves"],
    ],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]],
  },
  "rag-reference-architecture": retrieval("Documents", "knowledge_base", "knowledge-assistant"),
  "rag-enterprise-knowledge-search": retrieval("Wiki and policy exports", "company_wide", "knowledge-search"),
  "rag-customer-support-answers": retrieval("Knowledge base articles", "support_kb", "support-assistant"),
  "rag-permission-aware-retrieval": retrieval("Finance documents", "finance_restricted", "finance-assistant"),
  "rag-fresh-index-with-schedules": {
    nodes: [
      ["schedule_trigger", "Nightly 02:00"],
      ["mcp_resource", "Read changed documents"],
      ["store_documents", "Store with checksums"],
      ["chunk_embed", "Embed changed passages"],
      ["vector_index", "Vector index", { collection: "support_kb" }],
      ["retrieve", "Ask the known questions"],
      ["notify", "Alert the owning team"],
    ],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
  },
  "rag-agent-with-tools": {
    nodes: [
      ["ingest_documents", "Procedures"],
      ["store_documents", "Store"],
      ["chunk_embed", "Chunk and embed"],
      ["vector_index", "Vector index", { collection: "procedures" }],
      ["retrieve", "Retrieve the procedure"],
      ["llm_step", "Propose the action"],
      ["approval_gate", "Approver"],
      ["mcp_tool", "Make the change", CHANGE],
    ],
    links: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [5, 7], [6, 7]],
  },
  "enterprise-it-helpdesk-agent": toolAgent("Read the user's groups", "Propose the fix", "Manager approves", "Grant access"),
  "enterprise-meeting-briefing": {
    nodes: [
      ["schedule_trigger", "Weekdays 08:00"],
      ["time_window", "Business hours"],
      ["calendar_read", "Today's calendar"],
      ["email_inbox", "Unread mail"],
      ["llm_step", "Draft the briefing"],
      ["approval_gate", "Approve"],
      ["send_email", "Save as a draft", { mode: "Save as draft", to: "executive@example.com" }],
    ],
    links: [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4], [4, 5], [4, 6], [5, 6]],
  },
  "banking-payment-risk-functions": {
    nodes: [
      ["invoke_function", "Score the payment", { function: "fraud-score", attributeTo: "Card Risk Engine" }],
      ["aws_lambda_invoke", "Read the customer limits", { ...READ }],
      ["invoke_function", "Screen sanctions", { function: "sanctions-screen" }],
      ["invoke_function", "Summarise the case", { function: "case-summary" }],
      ["approval_gate", "Analyst reviews high risk"],
      ["mcp_tool", "Open the case", CHANGE],
    ],
    links: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 5]],
  },
  "banking-loan-document-review-workflow": {
    nodes: [
      ["invoke_function", "Extract the fields", { function: "doc-extract" }],
      ["invoke_function", "Summarise the file", { function: "loan-summary" }],
      ["approval_gate", "Underwriter decides"],
      ["mcp_tool", "Update the loan system", CHANGE],
    ],
    links: [[0, 1], [1, 2], [1, 3], [2, 3]],
  },
  "retail-ticket-triage-functions": {
    nodes: [
      ["invoke_function", "Classify the ticket", { function: "ticket-classify" }],
      ["invoke_function", "Draft a reply", { function: "ticket-reply-draft" }],
      ["approval_gate", "Agent reviews"],
      ["mcp_tool", "Save the draft", CHANGE],
    ],
    links: [[0, 1], [1, 2], [1, 3], [2, 3]],
  },
  "enterprise-ai-cost-digest-schedule": {
    nodes: [
      ["schedule_trigger", "Daily 07:00"],
      ["invoke_function", "Write the digest", { function: "cost-digest" }],
      ["approval_gate", "Finance owner reviews"],
      ["send_email", "Save as a draft", { mode: "Save as draft", to: "finance@example.com" }],
    ],
    links: [[0, 1], [1, 2], [1, 3], [2, 3]],
  },
  "healthcare-local-model-functions": {
    nodes: [
      ["invoke_function", "Summarise the note", { function: "local-summarise" }],
      ["approval_gate", "Clinician reviews"],
      ["mcp_tool", "File the summary", CHANGE],
    ],
    links: [[0, 1], [0, 2], [1, 2]],
  },
  "startups-agent-with-tools": toolAgent("Look up the order", "Propose a refund", "Owner approves", "Issue the refund"),
};
