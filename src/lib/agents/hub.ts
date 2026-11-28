"use client";

import { useMemo } from "react";
import { buildFixtures } from "@/lib/mlops/fixtures";
import { useMlops } from "@/lib/mlops/store";
import { sampleChannelList } from "@/lib/notifications/client";
import { makeHub, type Hub } from "./connectors";

/**
 * What the organisation has set up that agents can use: Integrations connections, Notification Center channels and RAG indexes.
 * In the sample workspace it reads the same stores the Integrations, Notification Center and RAG screens read, so a connection added there shows up here.
 */
let sample: Hub | null = null;
export function sampleHub(): Hub {
  if (!sample) { const f = buildFixtures(); sample = makeHub(f.connections, sampleChannelList(), f.knowledge); }
  return sample;
}

export function useHub(): Hub {
  const m = useMlops();
  return useMemo(() => (m ? makeHub(m.connections, sampleChannelList(), m.knowledge) : sampleHub()), [m]);
}
