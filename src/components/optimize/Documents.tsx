"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { useState } from "react";
import { Segmented } from "@/components/ui/Form";
import { Notice } from "@/components/mlops/ui";
import { DOC_TYPES, LIBRARY } from "@/lib/optimize/data";
import bench from "@/lib/optimize/benchmark.json";

type Row = (typeof bench.rows)[number];
const pctOf = (before: number, after: number) => `${Math.round((1 - after / before) * 100)}%`;
/** Measured reduction for a kind of content, summed over the benchmark documents that represent it. */
function measured(ids: string[], enc: string) {
  const rows = bench.rows.filter((r) => r.enc === enc && ids.includes(r.id));
  if (!rows.length) return null;
  const sum = (k: keyof Row) => rows.reduce((a, r) => a + (r[k] as number), 0), b = sum("before");
  return { lossless: pctOf(b, sum("lossless")), safe: pctOf(b, sum("safe")) };
}

const WHERE_TONE = { gateway: "healthy", "document worker": "info", "GPU worker": "degraded" } as const;
const fmt = (n: number) => n.toLocaleString("en-US");

function Benchmark() {
  const [enc, setEnc] = useState<"o200k_base" | "cl100k_base">("o200k_base");
  const rows = bench.rows.filter((r) => r.enc === enc);
  const tot = (k: keyof Row) => rows.reduce((a, r) => a + (r[k] as number), 0), b = tot("before");
  const cols: [keyof Row, string][] = [["lossless", "Lossless"], ["safe", "Plus furniture and phrases"], ["balanced", "Balanced"], ["aggressive", "Aggressive"]];
  return (
    <Card>
      <CardHeader title="Measured on a test corpus" subtitle={`${rows.length} synthetic documents, counted with the real tokenizer. Not customer data, and the results are specific to documents shaped like these.`}
        action={<Segmented value={enc} onChange={setEnc} options={[{ value: "o200k_base", label: "o200k" }, { value: "cl100k_base", label: "cl100k" }]} />} />
      <Table>
        <Thead><tr><Th>Document</Th><Th className="text-right">Tokens</Th>{cols.map(([k, l]) => <Th key={k} className="text-right">{l}</Th>)}<Th className="text-right">Details cut to fit</Th></tr></Thead>
        <tbody>
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td><div className="font-medium">{r.label}</div><div className="text-xs text-text-tertiary">{r.type}{r.question ? "" : ", no question"}</div></Td>
              <Td className="text-right tabular-nums">{fmt(r.before)}</Td>
              {cols.map(([k]) => <Td key={k} className="text-right tabular-nums">{pctOf(r.before, r[k] as number)}</Td>)}
              <Td className="text-right tabular-nums">{r.details.cut ? `${r.details.cut} of ${r.details.total}` : "0"}</Td>
            </Tr>))}
          <Tr><Td className="font-medium">All documents</Td><Td className="text-right tabular-nums font-medium">{fmt(b)}</Td>{cols.map(([k]) => <Td key={k} className="text-right tabular-nums font-medium">{pctOf(b, tot(k))}</Td>)}<Td>{" "}</Td></Tr>
        </tbody>
      </Table>
      <div className="p-5 pt-3 space-y-3">
        <Notice tone="info" title="How to read this">Lossless only changes how the same content is written, so a plain contract gains nothing and a CSV of mixed values gains little. The large gains come from structure: JSON records written as a table, web pages with their navigation removed, PDF pages with repeated headers, and text that repeats its own phrases. The test documents are generated to look like real exports and are more repetitive than many real files, so treat the totals as a measurement of this corpus, and the library below as the figure for yours. Balanced and aggressive fit long text to the question, so they can cut details that do not relate to it, and the last column counts them.</Notice>
      </div>
    </Card>
  );
}

export function Documents() {
  const raw = LIBRARY.reduce((s, d) => s + d.rawTokens, 0), kept = LIBRARY.reduce((s, d) => s + d.storedTokens, 0);
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Process a document once, use it on every request" subtitle="The cheapest token is one that is never sent again. A document is read, cleaned and stored when it is added or changed. Requests then use the stored form, so the cost of preparing it is paid once and not on every call." />
        <ol className="grid sm:grid-cols-2 xl:grid-cols-6 gap-3 p-5 pt-0 text-xs">
          {[
            ["Detect", "File type and language, from content and not only the extension."],
            ["Extract", "A reader for each type pulls out text, tables and structure."],
            ["Convert", "Structure read, repeats and page furniture removed, every table written in its cheapest form."],
            ["Verify", "Every number, identifier and link is looked for in the result. A miss sends the original."],
            ["Split", "Cut on headings and tables, never in the middle of a record."],
            ["Store", "Hashed with the policy and the tokenizer family. An unchanged file is never converted twice."],
          ].map(([h, b], i) => (
            <li key={h} className="rounded-lg border border-border p-3"><div className="text-text-tertiary tabular-nums">{i + 1}</div><div className="text-[13px] font-medium text-text-primary mt-1">{h}</div><p className="text-text-secondary mt-1">{b}</p></li>))}
        </ol>
      </Card>

      <Benchmark />

      <Card>
        <CardHeader title="What is supported" subtitle="Reductions are measured on our synthetic test corpus with the o200k tokenizer, and shown only where we have measured. Your own documents will differ, which is why the library below records the real figure for each one." />
        <Table>
          <Thead><tr><Th>Content</Th><Th>Formats</Th><Th>How it is read</Th><Th>What is removed</Th><Th>Runs in</Th><Th className="text-right">Measured, lossless / plus furniture and phrases</Th></tr></Thead>
          <tbody>
            {DOC_TYPES.map((t) => (
              <Tr key={t.id}>
                <Td><div className="font-medium">{t.label}</div>{t.inspector && <div className="text-xs text-text-tertiary">Try it in the Prompt inspector</div>}</Td>
                <Td className="text-xs text-text-secondary">{t.formats}</Td>
                <Td className="text-xs text-text-secondary max-w-[16rem]">{t.reads}</Td>
                <Td className="text-xs text-text-secondary max-w-[16rem]">{t.removes}</Td>
                <Td className="whitespace-nowrap"><Badge tone={WHERE_TONE[t.where]}>{t.where}</Badge></Td>
                <Td className="text-right tabular-nums whitespace-nowrap">{(() => { const m = measured(t.corpus, "o200k_base"); return m ? `${m.lossless} / ${m.safe}` : <span className="text-text-tertiary">Not measured</span>; })()}</Td>
              </Tr>))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Context library" subtitle={`${LIBRARY.length} documents, ${fmt(raw)} tokens as uploaded, ${fmt(kept)} as stored (${((1 - kept / raw) * 100).toFixed(0)}% fewer).`} />
        <Table>
          <Thead><tr><Th>Document</Th><Th>Type</Th><Th className="text-right">As uploaded</Th><Th className="text-right">As stored</Th><Th className="text-right">Reduction</Th><Th className="text-right">Requests, 30 days</Th><Th>Version</Th><Th>State</Th></tr></Thead>
          <tbody>
            {LIBRARY.map((d) => (
              <Tr key={d.id}>
                <Td><div className="font-medium max-w-[18rem] truncate">{d.name}</div><div className="text-xs text-text-tertiary">{d.mode} &middot; updated {d.updated}</div></Td>
                <Td className="text-xs text-text-secondary">{d.type}</Td>
                <Td className="text-right tabular-nums">{fmt(d.rawTokens)}</Td>
                <Td className="text-right tabular-nums">{fmt(d.storedTokens)}</Td>
                <Td className="text-right tabular-nums">{((1 - d.storedTokens / d.rawTokens) * 100).toFixed(0)}%</Td>
                <Td className="text-right tabular-nums">{fmt(d.requests30d)}</Td>
                <Td className="tabular-nums">v{d.version}</Td>
                <Td className="whitespace-nowrap"><Badge tone={d.state === "ready" ? "healthy" : d.state === "processing" ? "info" : "degraded"}>{d.state === "needs review" ? "Needs review" : d.state === "processing" ? "Processing" : "Ready"}</Badge></Td>
              </Tr>))}
          </tbody>
        </Table>
        <p className="px-5 py-3 text-xs text-text-tertiary border-t border-border">Sample data. A document marked Needs review had content the reader could not place with confidence, such as a table inside an image, and is not served until a person checks it.</p>
      </Card>
    </div>
  );
}
