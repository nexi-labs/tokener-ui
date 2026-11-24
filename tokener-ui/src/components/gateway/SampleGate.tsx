"use client";

import { Database } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * Wraps a screen whose rows are fixed sample values. In the sample workspace the screen shows
 * with a label saying so. In a signed-in workspace it shows nothing invented: the figures on
 * these screens are not read from the platform yet, so presenting them would pass sample
 * numbers off as the workspace's own.
 */
export function SampleGate({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const { status } = useAuth();
  if (status === "session") {
    return (
      <>
        <PageHeader title={title} description={description} />
        <Card>
          <EmptyState
            icon={Database}
            title="Not connected to your workspace yet"
            description="This screen does not read from the platform yet, so it shows nothing rather than example figures. The sample workspace shows how it will look."
          />
        </Card>
      </>
    );
  }
  return (
    <>
      <div className="mb-4 flex items-center gap-2 text-xs text-text-tertiary">
        <span className="inline-flex items-center rounded border border-dashed border-border-strong px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Sample data</span>
        <span>Every figure on this screen is an example, not a measurement.</span>
      </div>
      {children}
    </>
  );
}
