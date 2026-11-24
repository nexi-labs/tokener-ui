"use client";

import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { APPS, EVENTS, SHADOW } from "@/lib/optimize/data";

const EV_TONE = { "auto-disabled": "degraded", restored: "healthy", changed: "neutral" } as const;
const EV_LABEL = { "auto-disabled": "Turned off automatically", restored: "Restored", changed: "Changed" } as const;

export function Fidelity() {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Is the model still getting what it needs?" subtitle="For a sample of requests the gateway also sends the original prompt to a model in the background. The two answers are compared, and the critical details in the original are checked against what was sent." />
        <Table>
          <Thead><tr><Th>Application</Th><Th className="text-right">Sample</Th><Th className="text-right">Answer agreement</Th><Th className="text-right">Details kept</Th><Th className="text-right">Judge score change</Th><Th className="text-right">Floor</Th><Th>State</Th></tr></Thead>
          <tbody>
            {SHADOW.map((r) => (
              <Tr key={r.appId}>
                <Td>{APPS.find((a) => a.id === r.appId)?.name}</Td>
                <Td className="text-right tabular-nums">{r.sample.toLocaleString("en-US")}</Td>
                <Td className="text-right tabular-nums">{r.agreement.toFixed(1)}%</Td>
                <Td className="text-right tabular-nums">{r.critical.toFixed(1)}%</Td>
                <Td className="text-right tabular-nums">{r.judge === 0 ? "0.00" : r.judge.toFixed(2)}</Td>
                <Td className="text-right tabular-nums">{r.floor}%</Td>
                <Td><Badge tone={r.state === "passing" ? "healthy" : "degraded"}>{r.state === "passing" ? "Passing" : "Watch"}</Badge></Td>
              </Tr>))}
          </tbody>
        </Table>
        <p className="px-5 py-3 text-xs text-text-tertiary border-t border-border">Sample data. Shadow requests are billed to the cost optimization budget, capped at 2% of traffic by default.</p>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Safeguards" />
          <CardBody>
            <ul className="space-y-3 text-[13px] text-text-secondary">
              <li><span className="font-medium text-text-primary">Protected content.</span> Code blocks, numbers, identifiers, quoted text, links and the user&apos;s question are never altered by a lossy stage.</li>
              <li><span className="font-medium text-text-primary">Automatic turn off.</span> When retention or agreement falls below the floor for an application, its lossy stages stop and the application falls back to lossless until a person restores them.</li>
              <li><span className="font-medium text-text-primary">Every change is explainable.</span> A request record keeps which stages ran, how many tokens each removed, and a diff, for as long as your audit retention allows.</li>
              <li><span className="font-medium text-text-primary">Honest savings.</span> Savings are the difference between provider reported usage and a shadow baseline, never a projected figure.</li>
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Recent events" />
          <ul className="divide-y divide-border">
            {EVENTS.map((e) => (
              <li key={e.at + e.what} className="px-5 py-3">
                <div className="flex items-center gap-2 flex-wrap"><Badge tone={EV_TONE[e.kind]}>{EV_LABEL[e.kind]}</Badge><span className="text-xs text-text-tertiary">{e.at} UTC &middot; {e.app}</span></div>
                <p className="text-[13px] text-text-secondary mt-1.5">{e.what}</p>
              </li>))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
