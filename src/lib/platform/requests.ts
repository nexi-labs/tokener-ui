"use client";

import { useSyncExternalStore } from "react";
import { setOverride } from "./connector-catalogue";
import type { IntegrationStatus } from "@/lib/mlops/types";

/**
 * Requests from customer organizations to platform admins: move a connector or an agent adapter to a more mature status so it can be used for real.
 * Operators decide here. Approving a connector writes the status to the catalogue the same moment, so every organization sees it, and the decision is
 * kept with who made it and why. The rules live in `decide` and are checked in scripts/check-platform-requests.ts. The server repeats them (docs/21).
 */
export type Kind = "connector" | "adapter";
export type Status = "pending" | "needs-info" | "approved" | "rejected";
export type Check = "contract" | "security" | "sandbox";
export const CHECKS: { id: Check; label: string; help: string }[] = [
  { id: "contract", label: "Contract tests pass", help: "The connector or adapter passes its contract tests against the vendor's own test service." },
  { id: "security", label: "Security review done", help: "Credentials stay as references, scopes are the least needed, and data leaving the platform is named." },
  { id: "sandbox", label: "Run once in a sandbox", help: "A real call ran end to end in a sandbox account, and the trace was reviewed." },
];
export type Request = {
  id: string; kind: Kind; target: string; targetName: string; org: string; requestedBy: string; at: string; from: IntegrationStatus; to: IntegrationStatus; why: string;
  status: Status; decidedBy?: string; decidedAt?: string; note?: string; checks: Check[];
};
type State = { requests: Request[]; adapterStatus: Record<string, IntegrationStatus> };

const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const seed = (): State => ({
  adapterStatus: {},
  requests: [
    { id: "req-101", kind: "connector", target: "slack", targetName: "Slack", org: "NexI", requestedBy: "Maya Okafor", at: ago(2), from: "planned", to: "beta", why: "Agents need to send approval notices to the claims channel. Email is not read fast enough.", status: "pending", checks: [] },
    { id: "req-102", kind: "connector", target: "teams", targetName: "Microsoft Teams", org: "Northwind Bank", requestedBy: "Tomas Berg", at: ago(4), from: "planned", to: "beta", why: "Our approvers work in Teams and cannot use Slack.", status: "pending", checks: ["contract"] },
    { id: "req-103", kind: "adapter", target: "bedrock-agents", targetName: "Amazon Bedrock Agents", org: "Contoso Retail", requestedBy: "Amara Diallo", at: ago(6), from: "planned", to: "beta", why: "Three production agents already run on Bedrock and need to be governed.", status: "needs-info", note: "Which AWS regions? The adapter reads one region per connection.", decidedBy: "Daniel Reyes", decidedAt: ago(5), checks: [] },
    { id: "req-104", kind: "adapter", target: "crewai", targetName: "CrewAI", org: "NexI", requestedBy: "Kenji Ito", at: ago(9), from: "planned", to: "available", why: "We want to retire our hand written runner.", status: "rejected", note: "Not ready for Available: no sandbox run is recorded. Ask again for Beta.", decidedBy: "Daniel Reyes", decidedAt: ago(8), checks: ["contract"] },
  ],
});

let state: State | null = null; const listeners = new Set<() => void>();
const get = (): State => (state ??= seed());
const set = (patch: Partial<State>) => { state = { ...get(), ...patch }; listeners.forEach((l) => l()); };
export const requestsNow = () => get();
export const resetRequests = () => { state = null; listeners.forEach((l) => l()); };
export function useRequests(): State { return useSyncExternalStore((cb) => { listeners.add(cb); return () => void listeners.delete(cb); }, get, get); }

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
const RANK: Record<IntegrationStatus, number> = { planned: 0, beta: 1, available: 2, custom: 2 };

/** What has to be true before a request may be approved. Available asks for every check, Beta for the contract and security checks. */
export const requiredChecks = (to: IntegrationStatus): Check[] => (to === "available" ? ["contract", "security", "sandbox"] : ["contract", "security"]);

export function decide(id: string, by: string, outcome: "approve" | "reject" | "needs-info", note: string, checks: Check[]): Result<Request> {
  const r = get().requests.find((x) => x.id === id);
  if (!r) return { ok: false, error: "That request does not exist." };
  if (r.status === "approved" || r.status === "rejected") return { ok: false, error: "This request was already decided." };
  if (!by.trim()) return { ok: false, error: "Say who is deciding." };
  if (outcome !== "approve" && note.trim().length < 5) return { ok: false, error: outcome === "reject" ? "Say why it is rejected, so the organization knows what to change." : "Say what you need to know." };
  if (outcome === "approve") {
    if (RANK[r.to] <= RANK[r.from]) return { ok: false, error: "The request does not move the status forward." };
    const missing = requiredChecks(r.to).filter((c) => !checks.includes(c));
    if (missing.length) return { ok: false, error: `Before approving ${r.to === "available" ? "Available" : "Beta"}, confirm: ${missing.map((m) => CHECKS.find((c) => c.id === m)!.label.toLowerCase()).join(", ")}.` };
  }
  const next: Request = { ...r, status: outcome === "approve" ? "approved" : outcome === "reject" ? "rejected" : "needs-info", decidedBy: by, decidedAt: new Date().toISOString(), note: note.trim() || undefined, checks };
  const patch: Partial<State> = { requests: get().requests.map((x) => (x.id === id ? next : x)) };
  if (outcome === "approve") {
    if (r.kind === "connector") setOverride(r.target, { status: r.to, note: note.trim() || undefined }, by, `Status set to ${r.to} on request ${r.id} from ${r.org}`);
    else patch.adapterStatus = { ...get().adapterStatus, [r.target]: r.to };
  }
  set(patch); return { ok: true, value: next };
}

/** A customer organization asks for a status change. One open request per target and organization. */
export function submit(input: { kind: Kind; target: string; targetName: string; org: string; requestedBy: string; from: IntegrationStatus; to: IntegrationStatus; why: string }): Result<Request> {
  if (input.why.trim().length < 15) return { ok: false, error: "Say what you need it for, in a sentence or two." };
  if (RANK[input.to] <= RANK[input.from]) return { ok: false, error: "Ask for a status above the current one." };
  if (get().requests.some((x) => x.target === input.target && x.org === input.org && (x.status === "pending" || x.status === "needs-info"))) return { ok: false, error: "This organization already has an open request for it." };
  const r: Request = { ...input, id: `req-${100 + get().requests.length + 1}`, at: new Date().toISOString(), status: "pending", checks: [] };
  set({ requests: [r, ...get().requests] }); return { ok: true, value: r };
}
