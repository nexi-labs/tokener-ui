"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { connectDemo, connectLive } from "@/lib/mlops/store";
import { connectRefineryDemo, connectRefineryLive } from "@/lib/refinery/store";
import { connectCrucibleDemo, connectCrucibleLive } from "@/lib/crucible/live/store";

/**
 * The console needs either a signed-in person or the demo workspace. Anyone else is sent to the sign-in page and returned here afterwards.
 * Nothing in the console renders until that is settled, so there is no flash of content for someone who is not signed in.
 */
export function ConsoleAuthGate({ children }: { children: React.ReactNode }) {
  const { status, orgId, isPlatform, user } = useAuth();
  const email = user?.email;
  const [synced, setSynced] = useState(false);
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (status === "anonymous") {
      // Keep the query string, so a link such as /mlops/pipelines/new?template=x returns to the same template after sign in.
      const here = (path || "/dashboard") + (typeof window !== "undefined" ? window.location.search : "");
      router.replace(`/login?next=${encodeURIComponent(here)}`);
    }
  }, [status, path, router]);

  // Point the data layer at the right source before any screen reads it: the API for a signed-in person, the sample data for the demo.
  useEffect(() => {
    if (status === "session") { connectLive({ orgId, isPlatform, userEmail: email }); connectRefineryLive({ orgId, isPlatform, userEmail: email }); connectCrucibleLive({ orgId, isPlatform, userEmail: email }); setSynced(true); }
    else if (status === "demo") { connectDemo(); connectRefineryDemo(); connectCrucibleDemo(); setSynced(true); }
    else { connectDemo(); connectRefineryDemo(); connectCrucibleDemo(); setSynced(false); }
  }, [status, orgId, isPlatform, email]);

  if ((status === "session" || status === "demo") && synced) return <>{children}</>;
  return (
    <div className="min-h-screen grid place-items-center bg-surface-subtle" role="status" aria-label="Loading">
      <Loader2 className="animate-spin text-text-tertiary" size={20} />
    </div>
  );
}
