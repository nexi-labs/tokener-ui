"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { liveAdmin, sampleAdmin, SAMPLE_ORG_ID, SAMPLE_ORG_NAME, SAMPLE_ROLES, type IamAdmin } from "./admin";

/** One sample admin for the whole session, so changes made on one screen are still there on another. */
const sample = sampleAdmin(SAMPLE_ROLES);

export type IamContext = {
  /** Null until the first refresh has finished, and for anonymous visitors. */
  admin: IamAdmin | null;
  /** The organization the people screens work in; null for a platform operator who has not been given one. */
  orgId: string | null;
  orgName: string | null;
  isPlatform: boolean;
  /** The signed-in person, so a screen never offers to disable your own account. */
  selfId: string | null;
  sample: boolean;
};

/** The identity administration client for the current workspace: the sample one in the sample workspace, the real one when signed in. */
export function useIamAdmin(): IamContext {
  const { status, orgId, user, isPlatform } = useAuth();
  const live = useMemo(() => (status === "session" ? liveAdmin({ orgId }) : null), [status, orgId]);
  if (status === "demo") return { admin: sample, orgId: SAMPLE_ORG_ID, orgName: SAMPLE_ORG_NAME, isPlatform: true, selfId: "u-01", sample: true };
  const name = user?.organizations?.find((o) => o.id === orgId)?.name ?? null;
  return { admin: live, orgId, orgName: name, isPlatform, selfId: user?.id ?? null, sample: false };
}
