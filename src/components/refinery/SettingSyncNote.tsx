"use client";

import { Check, CircleAlert, Loader2 } from "lucide-react";
import { syncsToServer, useSyncStatus } from "@/lib/refinery/settingsSync";

/** One line under an editor that saves as you type: where the setting is kept and whether the last save worked. Quiet in the sample workspace. */
export function SettingSyncNote() {
  const s = useSyncStatus();
  const live = syncsToServer();
  if (!live) return <p className="text-xs text-text-tertiary">Saved in this browser. Sign in to a workspace to keep it on the server.</p>;
  if (s.phase === "error") return <p role="alert" className="flex items-start gap-1.5 text-xs text-[#B42318]"><CircleAlert size={13} className="mt-px shrink-0" /> Not saved to the server. {s.message}</p>;
  if (s.phase === "saving") return <p role="status" className="flex items-center gap-1.5 text-xs text-text-tertiary"><Loader2 size={13} className="animate-spin" /> Saving to the server</p>;
  return <p role="status" className="flex items-center gap-1.5 text-xs text-text-tertiary">{s.phase === "saved" && <Check size={13} />} {s.phase === "saved" ? "Saved to the server" : "Changes are saved to the server as you make them."}</p>;
}
