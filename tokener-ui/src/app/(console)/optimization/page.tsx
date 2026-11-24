"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/mlops/ui";
import { SampleTag } from "@/components/gateway/bits";
import { Dashboard } from "@/components/optimize/Dashboard";
import { HowItWorks } from "@/components/optimize/HowItWorks";
import { Overview } from "@/components/optimize/Overview";
import { Inspector } from "@/components/optimize/Inspector";
import { Documents } from "@/components/optimize/Documents";
import { Policies } from "@/components/optimize/Policies";
import { Fidelity } from "@/components/optimize/Fidelity";

type Tab = "dashboard" | "overview" | "inspector" | "documents" | "policies" | "fidelity" | "how";

export default function OptimizationPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  return (
    <div className="space-y-5">
      <PageHeader title="Cost Optimization" description="Cut token spend without cutting what the model knows. Every prompt and document is converted into the form that costs the fewest tokens before it is sent, caching answers repeated questions, and any lossy step is checked against the original answer." />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs label="Cost optimization" wrap value={tab} onChange={setTab} tabs={[{ id: "dashboard", label: "Dashboard" }, { id: "overview", label: "Savings" }, { id: "inspector", label: "Prompt inspector" }, { id: "documents", label: "Documents" }, { id: "policies", label: "Policies" }, { id: "fidelity", label: "Fidelity" }, { id: "how", label: "How it works" }]} />
        {tab !== "inspector" && tab !== "how" && <SampleTag />}
      </div>
      {tab === "dashboard" && <Dashboard />}
      {tab === "overview" && <Overview />}
      {tab === "inspector" && <Inspector />}
      {tab === "documents" && <Documents />}
      {tab === "policies" && <Policies />}
      {tab === "fidelity" && <Fidelity />}
      {tab === "how" && <HowItWorks />}
    </div>
  );
}
