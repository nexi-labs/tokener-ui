import type { Env, RoleId } from "./types";

/**
 * Role model as the console shows it. The server enforces the same table (domain/policy/Rbac.java, checked against
 * this file by the golden export). It lets the console show exactly what each role may and may not do, so a viewer
 * sees a disabled control with a reason instead of a missing one.
 */
export type Action =
  | "view"
  | "connection.create" | "connection.rotate" | "connection.delete"
  | "model.register" | "model.approve"
  | "deployment.scale" | "deployment.promote" | "deployment.rollback"
  | "pipeline.edit" | "pipeline.publish" | "pipeline.run" | "run.cancel" | "run.approve"
  | "agent.enroll" | "agent.revoke" | "alert.acknowledge"
  | "settings.edit" | "sample.reset";

const ORDER: RoleId[] = ["viewer", "developer", "approver", "admin"];
const MIN: Record<Action, RoleId> = {
  view: "viewer",
  "connection.create": "admin", "connection.rotate": "admin", "connection.delete": "admin",
  "model.register": "developer", "model.approve": "approver",
  "deployment.scale": "developer", "deployment.promote": "approver", "deployment.rollback": "approver",
  "pipeline.edit": "developer", "pipeline.publish": "developer", "pipeline.run": "developer", "run.cancel": "developer", "run.approve": "approver",
  "agent.enroll": "admin", "agent.revoke": "admin", "alert.acknowledge": "developer",
  "settings.edit": "admin", "sample.reset": "viewer",
};

export const ACTION_LABEL: Record<Action, string> = {
  view: "View everything", "connection.create": "Create connections", "connection.rotate": "Rotate credentials", "connection.delete": "Delete connections",
  "model.register": "Register model versions", "model.approve": "Approve or reject model versions",
  "deployment.scale": "Scale deployments", "deployment.promote": "Promote to production", "deployment.rollback": "Roll back deployments",
  "pipeline.edit": "Edit pipeline drafts", "pipeline.publish": "Publish pipeline versions", "pipeline.run": "Run pipelines", "run.cancel": "Cancel runs", "run.approve": "Approve gates",
  "agent.enroll": "Enroll build agents", "agent.revoke": "Revoke build agents", "alert.acknowledge": "Acknowledge alerts", "settings.edit": "Change settings", "sample.reset": "Reset sample data",
};

export type Decision = { ok: true } | { ok: false; reason: string };

export function can(role: RoleId, action: Action, env?: Env): Decision {
  const min = MIN[action];
  if (ORDER.indexOf(role) < ORDER.indexOf(min)) return { ok: false, reason: `Requires the ${min} role. You are ${role}.` };
  // Developers may run and edit outside production only. Production changes need an approver.
  if (env === "production" && role === "developer" && ["pipeline.run", "deployment.scale"].includes(action)) {
    return { ok: false, reason: "Production changes need the approver role or an approval gate." };
  }
  return { ok: true };
}

export const ALL_ACTIONS = Object.keys(MIN) as Action[];
