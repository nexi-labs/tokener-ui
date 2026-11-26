"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Result } from "@/lib/crucible/live/types";

/** Runs a read through the driver and keeps its answer, its error and a way to read it again. A read that returns after the screen moved on is dropped. */
export function useRead<T>(read: () => Promise<Result<T>>, deps: unknown[]): { data: (T & { ok: true }) | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<(T & { ok: true }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const latest = useRef(0);
  const fn = useRef(read); fn.current = read;
  useEffect(() => {
    const mine = ++latest.current; setLoading(true);
    fn.current().then((r) => { if (mine !== latest.current) return; if (r.ok) { setData(r as T & { ok: true }); setError(null); } else setError(r.error); })
      .catch((e) => { if (mine === latest.current) setError(e instanceof Error ? e.message : "Could not load."); })
      .finally(() => { if (mine === latest.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
