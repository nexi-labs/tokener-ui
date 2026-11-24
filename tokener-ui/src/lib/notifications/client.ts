/**
 * The notification client. Live: /api/v1/notifications/channels (GET with tenantId, POST, DELETE which disables), /rules (GET with tenantId, POST),
 * /send (POST, a direct send) and /history (GET with tenantId and limit). There is no route to remove or switch off a rule.
 * Sample: an in-memory store in the sample workspace.
 * A channel's address is the one setting for its type: the recipient for email, the webhook address for Slack, Teams, Discord and webhooks. The server keeps a
 * webhook address in its secret manager and never returns it, so the console sends it once and never holds it again.
 */
import { ApiError, http } from "@/lib/api/client";

export type ChannelType = "EMAIL" | "SMS" | "SLACK" | "TEAMS" | "DISCORD" | "WEBHOOK";
export type CreatableType = "EMAIL" | "SLACK" | "TEAMS" | "DISCORD" | "WEBHOOK";
/** The setting each type takes, as the server names it. SMS is not offered: it depends on a Twilio account that is not set up from the console. */
export const TARGET_KEY: Record<CreatableType, string> = { EMAIL: "to", SLACK: "webhookUrl", TEAMS: "webhookUrl", DISCORD: "webhookUrl", WEBHOOK: "url" };
export type Channel = { id: string; channel: ChannelType; name: string; enabled: boolean };
export type Rule = { id: string; triggerEventType: string; conditionExpr: string | null; channelId: string; enabled: boolean };
export type Delivery = { id: string; channelId: string; subject: string; status: "PENDING" | "SENT" | "FAILED" | "RETRYING"; attempts: number; lastError: string | null; createdAt: string; sentAt: string | null };

/** Events the platform publishes to the streams the notification service reads and that carry a tenant id, so a tenant rule can match them. */
export const TRIGGERS: { value: string; label: string }[] = [
  { value: "BudgetBreachEvent", label: "Budget breach" },
  { value: "provider.registered", label: "Provider registered" },
  { value: "provider.disabled", label: "Provider disabled" },
  { value: "provider.credential_rotated", label: "Provider credential rotated" },
  { value: "provider.health_changed", label: "Provider health changed" },
  { value: "refinery.alert.raised", label: "Refinery alert raised" },
];

export interface NotificationAdmin {
  mode: "live" | "sample";
  channels(tenantId: string): Promise<Channel[]>;
  /** Adds a channel of a type the screen offers. `target` is the email address, or the webhook address. */
  createChannel(tenantId: string, type: CreatableType, name: string, target: string): Promise<string>;
  disableChannel(id: string): Promise<void>;
  rules(tenantId: string): Promise<Rule[]>;
  createRule(tenantId: string, triggerEventType: string, conditionExpr: string, channelId: string): Promise<string>;
  send(tenantId: string, channelId: string, subject: string, body: string): Promise<void>;
  history(tenantId: string, limit: number): Promise<Delivery[]>;
}

const B = "/api/v1/notifications";
export const liveNotifications: NotificationAdmin = {
  mode: "live",
  channels: (tenantId) => http.get<Channel[]>(`${B}/channels`, { tenantId }),
  createChannel: async (tenantId, type, name, target) => (await http.post<{ id: string }>(`${B}/channels`, { tenantId, channel: type, name, config: { [TARGET_KEY[type]]: target } })).id,
  disableChannel: (id) => http.delete(`${B}/channels/${id}`),
  rules: (tenantId) => http.get<Rule[]>(`${B}/rules`, { tenantId }),
  createRule: async (tenantId, triggerEventType, conditionExpr, channelId) => (await http.post<{ id: string }>(`${B}/rules`, { tenantId, triggerEventType, ...(conditionExpr.trim() ? { conditionExpr: conditionExpr.trim() } : {}), channelId })).id,
  send: async (tenantId, channelId, subject, body) => { await http.post(`${B}/send`, { tenantId, channelId, subject, body }); },
  history: (tenantId, limit) => http.get<Delivery[]>(`${B}/history`, { tenantId, limit }),
};

const T1 = "00000000-0000-4000-8000-0000000000b1";
const T2 = "00000000-0000-4000-8000-0000000000b2";
const id = (k: string, n: number) => `00000000-0000-4000-8000-0000000${k}${String(n).padStart(4, "0")}`;
const ago = (h: number) => new Date(Date.UTC(2026, 9, 29, 9, 0) - h * 3_600_000).toISOString();
/** The sample channels that Agent OS agents use for approvals and alerts. They are the same channels the Notification Center lists. */
export const SAMPLE_TENANT = T1;
export const SAMPLE_CHANNEL = {
  financeEmail: id("d", 1), platformAlerts: id("d", 2), devNotices: id("d", 3), paymentsApprovals: id("d", 5), supportLeads: id("d", 6), legalReviewers: id("d", 7), codeOwners: id("d", 8), pricingManagers: id("d", 9), claimsDesk: id("d", 10), claimsAdjusters: id("d", 11),
} as const;
let channels: (Channel & { tenantId: string })[] = [
  { id: id("d", 1), tenantId: T1, channel: "EMAIL", name: "Finance team", enabled: true },
  { id: id("d", 2), tenantId: T1, channel: "SLACK", name: "#platform-alerts", enabled: true },
  { id: id("d", 3), tenantId: T1, channel: "DISCORD", name: "#dev-notices", enabled: false },
  { id: id("d", 4), tenantId: T2, channel: "EMAIL", name: "Platform on-call", enabled: true },
  { id: id("d", 5), tenantId: T1, channel: "SLACK", name: "#payments-approvals", enabled: true },
  { id: id("d", 6), tenantId: T1, channel: "SLACK", name: "#support-leads", enabled: true },
  { id: id("d", 7), tenantId: T1, channel: "TEAMS", name: "Legal reviewers", enabled: true },
  { id: id("d", 8), tenantId: T1, channel: "SLACK", name: "#code-owners", enabled: true },
  { id: id("d", 9), tenantId: T1, channel: "EMAIL", name: "Pricing managers", enabled: true },
  { id: id("d", 10), tenantId: T1, channel: "SLACK", name: "#claims-desk", enabled: true },
  { id: id("d", 11), tenantId: T1, channel: "EMAIL", name: "Claims adjusters", enabled: true },
];
/** The channels of the sample organisation, read without a request. Agent OS screens in the sample workspace use it. */
export const sampleChannelList = (): Channel[] => channels.filter((c) => c.tenantId === T1).map(strip);
let rules: (Rule & { tenantId: string })[] = [
  { id: id("e", 1), tenantId: T1, triggerEventType: "BudgetBreachEvent", conditionExpr: "action=BLOCK", channelId: id("d", 1), enabled: true },
  { id: id("e", 2), tenantId: T1, triggerEventType: "provider.health_changed", conditionExpr: null, channelId: id("d", 2), enabled: true },
];
let sent: (Delivery & { tenantId: string })[] = [
  { id: id("f", 1), tenantId: T1, channelId: id("d", 1), subject: "BudgetBreachEvent", status: "SENT", attempts: 1, lastError: null, createdAt: ago(5), sentAt: ago(5) },
  { id: id("f", 2), tenantId: T1, channelId: id("d", 2), subject: "provider.health_changed", status: "FAILED", attempts: 3, lastError: "Slack returned 404 for the webhook address", createdAt: ago(30), sentAt: null },
  { id: id("f", 3), tenantId: T1, channelId: id("d", 1), subject: "Test message", status: "SENT", attempts: 1, lastError: null, createdAt: ago(52), sentAt: ago(52) },
];
const strip = <T extends { tenantId: string }>({ tenantId: _t, ...rest }: T) => rest;

export const sampleNotifications: NotificationAdmin = {
  mode: "sample",
  channels: async (t) => channels.filter((c) => c.tenantId === t).map(strip),
  createChannel: async (tenantId, type, name, target) => {
    const t = target.trim();
    if (type === "EMAIL" ? !/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(t) : !/^https:\/\/[^\s/@:]+\//.test(t)) throw new ApiError(400, "validation_failed", type === "EMAIL" ? "Enter one valid email address." : "The webhook address must start with https://.");
    if (type === "SLACK" && !t.startsWith("https://hooks.slack.com/")) throw new ApiError(400, "validation_failed", "A Slack webhook address is on hooks.slack.com.");
    if (type === "DISCORD" && !/^https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\//.test(t)) throw new ApiError(400, "validation_failed", "A Discord webhook address is on discord.com under /api/webhooks/.");
    const cid = id("d", 100 + channels.length);
    channels = [...channels, { id: cid, tenantId, channel: type, name, enabled: true }];
    return cid;
  },
  disableChannel: async (cid) => { channels = channels.map((c) => (c.id === cid ? { ...c, enabled: false } : c)); },
  rules: async (t) => rules.filter((r) => r.tenantId === t).map(strip),
  createRule: async (tenantId, triggerEventType, conditionExpr, channelId) => {
    const rid = id("e", 100 + rules.length);
    rules = [...rules, { id: rid, tenantId, triggerEventType, conditionExpr: conditionExpr.trim() || null, channelId, enabled: true }];
    return rid;
  },
  send: async (tenantId, channelId, subject) => { sent = [{ id: id("f", sent.length + 1), tenantId, channelId, subject, status: "SENT", attempts: 1, lastError: null, createdAt: new Date().toISOString(), sentAt: new Date().toISOString() }, ...sent]; },
  history: async (t, limit) => sent.filter((d) => d.tenantId === t).slice(0, limit).map(strip),
};
