import type { McpServerSpec } from "./mcp-model";

const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

/** Sample servers the console starts with. Each one passes validation, so the first thing a person sees is a clean example. */
export function seedServers(): McpServerSpec[] {
  return [
    {
      id: "mcps-support", name: "Customer support tools", slug: "support-tools", env: "staging", auth: "api-key", ratePerMinute: 300, audit: "metadata", redactResults: true,
      description: "Lets a support assistant look up orders, search the help centre, answer policy questions and ask for a refund. Refunds wait for a person.",
      status: "published", version: 3, createdAt: at(21), updatedAt: at(2), demo: true,
      tools: [
        {
          id: "t-order", name: "lookup_order", effect: "reads", approval: false,
          description: "Returns the status, items and delivery estimate for one order. Use it when a customer asks where their order is.",
          fields: [{ name: "order_id", type: "string", required: true, description: "The order number, for example 10432." }],
          source: { kind: "http", method: "GET", url: "https://orders.example.com/v1/orders/{{order_id}}", secretName: "ORDERS_API_TOKEN" },
        },
        {
          id: "t-help", name: "search_help_center", effect: "reads", approval: false,
          description: "Searches the help centre articles and returns the best passages with their sources. Use it before answering a how-to question.",
          fields: [{ name: "question", type: "string", required: true, description: "The customer's question in plain words." }],
          source: { kind: "pipeline", pipelineId: "pl-agent", waitSeconds: 60 },
        },
        {
          id: "t-policy", name: "ask_policy_question", effect: "reads", approval: false,
          description: "Answers a question about the returns and delivery policy in one or two sentences, through the gateway so budget and policy apply.",
          fields: [{ name: "question", type: "string", required: true, description: "A policy question, for example how long a return window lasts." }],
          source: { kind: "model", alias: "chat-default", instruction: "Answer in one or two sentences using only the returns and delivery policy. Say when the policy does not cover the question." },
        },
        {
          id: "t-refund", name: "request_refund", effect: "changes", approval: true,
          description: "Starts a refund for an order. The refund waits for a person to approve it, and nothing is paid until they do.",
          fields: [
            { name: "order_id", type: "string", required: true, description: "The order to refund." },
            { name: "reason", type: "string", required: true, description: "Why the customer is asking for a refund.", options: ["damaged", "late", "wrong item", "changed mind"] },
          ],
          source: { kind: "pipeline", pipelineId: "pl-payments", waitSeconds: 120 },
        },
      ],
    },
    {
      id: "mcps-ops", name: "Operations reporting", slug: "ops-reporting", env: "development", auth: "api-key", ratePerMinute: 120, audit: "metadata", redactResults: true,
      description: "Read-only reporting for the operations team: weekly throughput from the features database and a short incident summary.",
      status: "draft", version: 0, createdAt: at(4), updatedAt: at(1), demo: true,
      tools: [
        {
          id: "t-thru", name: "weekly_throughput", effect: "reads", approval: false,
          description: "Returns the number of requests and the average latency per day for one week. Use it to answer how busy the service was.",
          fields: [{ name: "week_start", type: "string", required: true, description: "The Monday of the week as YYYY-MM-DD." }],
          source: { kind: "sql", connectionId: "conn-dev-pg", query: "select day, requests, avg_latency_ms from daily_throughput where day >= :week_start::date and day < :week_start::date + 7 order by day limit 14" },
        },
        {
          id: "t-inc", name: "summarise_incident", effect: "reads", approval: false,
          description: "Writes a three line summary of an incident from its notes: what happened, the impact and what is next.",
          fields: [{ name: "notes", type: "string", required: true, description: "The raw incident notes." }],
          source: { kind: "model", alias: "vllm-cluster/llama-3-70b", instruction: "Summarise the incident in three short lines: what happened, the impact, what happens next." },
        },
      ],
    },
  ];
}
