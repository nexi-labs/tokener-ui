import type { ModelVersion } from "./types";

/**
 * Registry stages for a model version. The same rules the server applies in ModelService.setStage, so the console can say why a move is not offered:
 *   - a version moves to staging or production only when it is approved (or needs no approval),
 *   - production only from staging,
 *   - moving a version to production returns the version that was in production to staging,
 *   - production needs the approve permission, every other move needs the register permission.
 */
export type Stage = ModelVersion["stage"];
export const STAGES: Stage[] = ["none", "staging", "production", "archived"];
export const STAGE_LABEL: Record<Stage, string> = { none: "Not released", staging: "Staging", production: "Production", archived: "Archived" };
export const STAGE_ACTION: Record<Stage, "model.register" | "model.approve"> = { none: "model.register", staging: "model.register", production: "model.approve", archived: "model.register" };

export type StageMove = { to: Stage; allowed: boolean; why?: string; demotes?: number };

export const releasable = (v: ModelVersion) => v.approval.state === "approved" || v.approval.state === "not-required";

/** The reason a move is refused, or null. Matches the server's messages. */
export function stageProblem(versions: ModelVersion[], version: number, to: Stage): string | null {
  const v = versions.find((x) => x.version === version);
  if (!v) return "That version does not exist.";
  if (to === v.stage) return null;
  if ((to === "staging" || to === "production") && !releasable(v)) return `Version ${version} is ${v.approval.state}. It must be approved before it can be released.`;
  if (to === "production" && v.stage !== "staging") return "A version must be in staging before it goes to production.";
  return null;
}

export function stageMoves(versions: ModelVersion[], version: number): StageMove[] {
  const v = versions.find((x) => x.version === version);
  if (!v) return [];
  return STAGES.filter((s) => s !== v.stage).map((to) => {
    const why = stageProblem(versions, version, to);
    const demoted = to === "production" ? versions.find((x) => x.version !== version && x.stage === "production")?.version : undefined;
    return { to, allowed: !why, why: why ?? undefined, demotes: demoted };
  });
}

/** The new list of versions after a move. Does not check the rules, call stageProblem first. */
export function applyStage(versions: ModelVersion[], version: number, to: Stage): ModelVersion[] {
  return versions.map((x) => (x.version === version ? { ...x, stage: to } : to === "production" && x.stage === "production" ? { ...x, stage: "staging" as const } : x));
}
