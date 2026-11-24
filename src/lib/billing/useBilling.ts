"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ApiError } from "@/lib/api/client";
import { liveDriver, sampleDriver, useSampleAccount, type BillingAccount, type BillingDriver } from "./model";

export type BillingView =
  | { status: "loading"; account: null; driver: BillingDriver | null; reload: () => void }
  | { status: "ready"; account: BillingAccount; driver: BillingDriver; reload: () => void; adopt: (a: BillingAccount) => void }
  | { status: "unavailable"; account: null; driver: BillingDriver | null; reload: () => void; message: string };

/**
 * The organization's billing account, from the sample store in the sample workspace and from the API in a signed-in one. A signed-in workspace
 * whose billing service is not reachable says so; it never falls back to sample numbers.
 */
export function useBilling(): BillingView {
  const { status, orgId } = useAuth();
  const sample = useSampleAccount();
  const [live, setLive] = useState<BillingAccount | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const driver = useMemo<BillingDriver | null>(() => (status === "demo" ? sampleDriver : status === "session" && orgId ? liveDriver(orgId) : null), [status, orgId]);

  useEffect(() => {
    if (status !== "session") return;
    if (!orgId) { setProblem("This account is not part of an organization yet, so there is no billing account."); return; }
    let live = true;
    setProblem(null);
    liveDriver(orgId).load()
      .then((a) => { if (live) setLive(a); })
      .catch((e) => { if (live) setProblem(e instanceof ApiError && e.status === 404 ? "Billing is not available for this organization yet." : e instanceof ApiError ? e.message : "Billing could not be loaded."); });
    return () => { live = false; };
  }, [status, orgId, tick]);

  if (status === "demo") return { status: "ready", account: sample, driver: sampleDriver, reload, adopt: () => undefined };
  if (problem) return { status: "unavailable", account: null, driver, reload, message: problem };
  if (status === "session" && live && driver) return { status: "ready", account: live, driver, reload, adopt: setLive };
  return { status: "loading", account: null, driver, reload };
}
