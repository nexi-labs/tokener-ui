"use client";

import { useCallback, useEffect, useState } from "react";
import { PROVIDERS, type Provider } from "@/lib/gateway/data";
import { readRegistered, type Registered } from "@/lib/gateway/provider-catalog";
import { liveApi } from "@/lib/gateway/provider-live";
import { liveOrgId, useMlopsStatus } from "@/lib/mlops/store";

/**
 * The providers to show. The sample workspace shows the sample providers plus any registered in this browser session. A signed-in workspace shows
 * what the registry holds for its organisation, and nothing else.
 */
export function useProviders(): { all: (Provider | Registered)[]; ready: boolean; live: boolean; error: string | null; reload: () => void } {
  const { mode } = useMlopsStatus();
  const live = mode === "live";
  const orgId = live ? liveOrgId() : null;
  const [reg, setReg] = useState<Registered[]>([]);
  const [fromApi, setFromApi] = useState<Registered[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (live) return;
    const read = () => setReg(readRegistered());
    read(); setReady(true);
    window.addEventListener("tok-providers", read);
    return () => window.removeEventListener("tok-providers", read);
  }, [live]);

  useEffect(() => {
    if (!live) return;
    let off = false;
    setReady(false);
    liveApi.list(orgId).then((l) => { if (!off) { setFromApi(l); setError(null); setReady(true); } })
      .catch((e: Error) => { if (!off) { setError(e.message); setReady(true); } });
    return () => { off = true; };
  }, [live, orgId, tick]);

  return { all: live ? fromApi : [...PROVIDERS, ...reg], ready, live, error, reload };
}
