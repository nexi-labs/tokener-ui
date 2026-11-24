"use client";

import Link from "next/link";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Notice } from "@/components/mlops/ui";
import { CodeBlock } from "@/components/mlops/Code";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";

const CLIENT = `import os
from openai import OpenAI

client = OpenAI(
    base_url="https://gateway.example.com/v1",   # was api.openai.com
    api_key=os.environ["TOKENER_API_KEY"],       # a gateway key
)

reply = client.chat.completions.create(
    model="default-chat",                        # a gateway alias
    messages=[
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": email_thread + "\\n\\n" + question},
    ],
    extra_headers={
        "X-Tokener-Fidelity": "balanced",    # optional
        "X-Tokener-Question": question,      # optional
    },
)`;

const RESPONSE = `HTTP/1.1 200 OK
X-Tokener-Trace-Id: tr_01JC8W4R2Q
X-Tokener-Cache: miss
X-Tokener-Tokens-Original: 4812
X-Tokener-Tokens-Sent: 2967
X-Tokener-Optimizations: markup,whitespace,dedupe,boilerplate
X-Tokener-Fidelity: balanced
X-Tokener-Overhead-Ms: 3.8`;

const STEPS: [string, string, string][] = [
  ["Connect", "Change the base URL and use a gateway key. Nothing else in the application changes, and it keeps working with any OpenAI-compatible library.", "API Keys"],
  ["Choose a policy", "Each application gets a fidelity mode. Lossless is the default and never removes meaning. Stricter applications stay lossless, drafting tools can allow more.", "Policies tab"],
  ["Add documents once", "Upload reference documents to the context library. They are read, cleaned and stored one time, then reused by every request that cites them.", "Documents tab"],
  ["Watch it happen", "Every request appears within a second with its tokens before and after, which stages acted, whether the cache answered, and the time added.", "Dashboard, Live requests"],
  ["Check it is safe", "A sample of requests is replayed without optimization and the answers are compared. If quality falls below the floor, the lossy stages switch off by themselves and the owner is notified.", "Fidelity tab"],
  ["Tune with evidence", "The curves show what a stricter setting would save and what it would cost, so a change is a decision and not a guess.", "Dashboard, settings curve"],
];

const REQ: [string, string, string][] = [
  ["X-Tokener-Fidelity", "off, lossless, balanced, aggressive", "Overrides the application policy for one request, never above the maximum the policy allows."],
  ["X-Tokener-Question", "Any text", "What the model is being asked. Fitting to a budget keeps the sentences that relate to it. Without it, that step is skipped."],
  ["X-Tokener-Cache", "default, no-store, refresh", "Skips the cache for a request that must be fresh, or replaces a stored answer."],
];

export function HowItWorks() {
  return (
    <div className="space-y-5">
      <Notice tone="info" title="Design for the gateway">These are the interfaces the gateway will implement. Nothing on this page is callable yet. The screens in the other tabs show what they will display once it is.</Notice>

      <Card>
        <CardHeader title="How customers use it" subtitle="Six steps, and the first one is a single line of code." />
        <CardBody>
          <ol className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {STEPS.map(([h, b, w], i) => (
              <li key={h} className="rounded-lg border border-border p-4">
                <div className="text-xs text-text-tertiary tabular-nums">{i + 1}</div>
                <div className="text-[13px] font-medium text-text-primary mt-0.5">{h}</div>
                <p className="text-xs text-text-secondary mt-1.5">{b}</p>
                <p className="text-[11px] text-text-tertiary mt-2">Where: {w}</p>
              </li>))}
          </ol>
        </CardBody>
      </Card>

      <div className="grid xl:grid-cols-2 gap-5">
        <Card>
          <CardHeader title="Point an application at the gateway" subtitle="The application sends the same request it already sends." />
          <CardBody className="space-y-4">
            <CodeBlock code={CLIENT} title="Python, OpenAI SDK" maxHeight={420} />
            <div>
              <div className="text-[13px] font-medium mb-2">What comes back</div>
              <CodeBlock code={RESPONSE} title="Response headers" maxHeight={240} />
              <p className="text-xs text-text-tertiary mt-2">The same figures are written to the request trace, so support and finance can answer &ldquo;what happened to this prompt&rdquo; without asking the developer.</p>
            </div>
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Controls on a single request" subtitle="All optional. The application policy applies when a header is absent." />
            <Table>
              <Thead><tr><Th>Header</Th><Th>Values</Th><Th>Effect</Th></tr></Thead>
              <tbody>{REQ.map(([h, v, e]) => <Tr key={h}><Td className="font-code text-xs whitespace-nowrap">{h}</Td><Td className="text-xs text-text-secondary">{v}</Td><Td className="text-xs text-text-secondary">{e}</Td></Tr>)}</tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Where it shows up, and how fast" />
            <CardBody>
              <ul className="divide-y divide-border text-[13px]">
                {[
                  ["Live requests", "Within a second of the request finishing.", null],
                  ["Dashboard gauges and graphs", "Updated every minute, for 24 hours, 7 days or 30 days.", null],
                  ["Request trace", "The full record of one request, stage by stage.", "/trace-studio"],
                  ["Fidelity", "Shadow results as they complete, with alerts when a floor is crossed.", null],
                  ["Billing and usage", "Savings as a line next to provider spend, per application.", "/billing"],
                ].map(([k, v, href]) => (
                  <li key={k as string} className="py-2.5 flex items-start justify-between gap-4"><span className="font-medium text-text-primary">{href ? <Link href={href as string} className="hover:underline">{k}</Link> : k}</span><span className="text-text-secondary text-right">{v}</span></li>))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Who uses what" />
            <CardBody>
              <ul className="space-y-2.5 text-[13px] text-text-secondary">
                <li><span className="font-medium text-text-primary">Developers</span> change the base URL, read the response headers and use the request controls.</li>
                <li><span className="font-medium text-text-primary">Platform operators</span> set policies, review the curves and decide which applications may use lossy stages.</li>
                <li><span className="font-medium text-text-primary">Finance</span> reads savings against provider spend, from provider usage and not from estimates.</li>
                <li><span className="font-medium text-text-primary">Compliance</span> relies on the diff and stage record kept for each request, and on the automatic turn off.</li>
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
