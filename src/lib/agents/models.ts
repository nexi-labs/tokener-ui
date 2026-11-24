import type { Deployment, ModelArtifact } from "@/lib/mlops/types";

/**
 * The models an agent can use. Hosted models are reached through the tok∑ner gateway with the organisation's provider keys. Your own models come
 * from the Model Registry: a version that is approved and served by a healthy deployment. The agent calls it through the same gateway, so policy,
 * budget and tracing apply the same way, and the spec names it as `registry/<deployment>`.
 */
export const HOSTED_MODELS = ["gpt-5", "gpt-5-mini", "claude-sonnet-5-5", "claude-haiku-5-5", "gemini-2.5-pro"];
export const REGISTRY_PREFIX = "registry/";

export type ModelChoice = { value: string; label: string; detail: string; ok: boolean; problem?: string };

export function registryChoices(models: ModelArtifact[], deployments: Deployment[]): ModelChoice[] {
  return deployments.filter((d) => d.env !== "development").map((d) => {
    const m = models.find((x) => x.id === d.modelId); const v = m?.versions.find((x) => x.version === d.version);
    const approved = v ? v.approval.state === "approved" || v.approval.state === "not-required" : false;
    const problem = !m || !v ? "The model version behind this deployment no longer exists." : !approved ? `Version ${d.version} is ${v.approval.state}. It needs approval in the Model Registry.` : d.health === "failed" || d.health === "offline" ? `The deployment is ${d.health}.` : undefined;
    return { value: REGISTRY_PREFIX + d.name, label: `${d.name} (${m?.name ?? d.modelId} v${d.version})`, detail: `${d.env}, ${d.runtime}${d.health === "attention" ? ", needs attention" : ""}`, ok: !problem, problem: problem || undefined };
  });
}

export type ModelIssue = { level: "error" | "warning"; message: string };
export function checkModel(model: string, models: ModelArtifact[], deployments: Deployment[]): ModelIssue[] {
  if (!model.startsWith(REGISTRY_PREFIX)) return HOSTED_MODELS.includes(model) || !model ? [] : [{ level: "warning", message: `${model} is not a model the gateway lists. Check the name with your provider.` }];
  const c = registryChoices(models, deployments).find((x) => x.value === model);
  if (!c) return [{ level: "error", message: `${model.slice(REGISTRY_PREFIX.length)} is not a deployment in your Model Registry, or it runs only in development.` }];
  if (c.problem) return [{ level: "error", message: c.problem }];
  const d = deployments.find((x) => REGISTRY_PREFIX + x.name === model);
  return d && d.health === "attention" ? [{ level: "warning", message: "The deployment needs attention, so answers may be slow or fail." }] : [];
}
