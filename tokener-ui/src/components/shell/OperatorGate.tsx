"use client";

import { usePathname } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { OPERATOR_PREFIXES, isActive } from "@/lib/nav";
import { useShell } from "./ShellContext";
import { Button } from "@/components/ui/Button";

/**
 * Customer organizations never manage the platform itself. Operator pages
 * (cluster, feature flags, system settings, roles, health) show a gate unless
 * the signed in principal is a platform operator.
 */
export function OperatorGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role, setRole } = useShell();
  const guarded = OPERATOR_PREFIXES.some((h) => isActive(pathname, h));

  if (guarded && role !== "operator") {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center">
        <div className="mx-auto h-11 w-11 rounded-full bg-surface-muted flex items-center justify-center text-text-secondary mb-4">
          <ShieldAlert size={20} />
        </div>
        <h1 className="text-lg font-semibold text-text-primary">Platform operators only</h1>
        <p className="text-sm text-text-secondary mt-2">
          This section manages the tok∑ner platform itself. Customer organizations configure their own governance,
          budgets, providers, and keys from the other sections.
        </p>
        <div className="mt-5">
          <Button variant="secondary" onClick={() => setRole("operator")}>View as platform operator</Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
