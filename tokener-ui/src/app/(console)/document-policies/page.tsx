"use client";
import { SampleGate } from "@/components/gateway/SampleGate";

import { useState } from "react";
import clsx from "clsx";
import { Plus, Upload } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Segmented, Toggle } from "@/components/ui/Form";
import { Table, Thead, Th, Td, Tr } from "@/components/ui/Table";
import { Pipeline } from "@/components/flow/Pipeline";
import { ScanLine, FileText, Eraser, Database, ShieldCheck } from "lucide-react";

const POLICIES = [
  { name: "default-documents", scope: "tenant:prod", formats: 14, maxMb: 50, pii: "mask", status: "active" },
  { name: "legal-contracts", scope: "project:contract-review", formats: 6, maxMb: 100, pii: "block", status: "active" },
  { name: "support-attachments", scope: "project:helpdesk", formats: 9, maxMb: 20, pii: "mask", status: "active" },
  { name: "research-media", scope: "tenant:staging", formats: 18, maxMb: 500, pii: "detect", status: "draft" },
];

const FORMAT_GROUPS: { label: string; items: string[] }[] = [
  { label: "Documents", items: ["PDF", "DOCX", "DOC", "RTF", "ODT"] },
  { label: "Spreadsheets", items: ["XLSX", "XLS", "CSV", "TSV"] },
  { label: "Presentations", items: ["PPTX", "PPT"] },
  { label: "Text and markup", items: ["MD", "HTML", "XML", "JSON", "YAML", "TXT"] },
  { label: "Images", items: ["PNG", "JPG", "TIFF", "WEBP"] },
  { label: "Audio and video", items: ["MP3", "WAV", "MP4", "MOV"] },
  { label: "Archives", items: ["ZIP", "TAR", "GZ"] },
];

const CADS = [
  { id: "cad_01JB4X9Q", file: "msa-nexi-2026.pdf", type: "PDF", pages: 42, tokens: 38120, status: "ready" },
  { id: "cad_01JB4XA2", file: "q3-board-deck.pptx", type: "PPTX", pages: 28, tokens: 9410, status: "ready" },
  { id: "cad_01JB4XB7", file: "scanned-invoice-0912.tiff", type: "TIFF", pages: 3, tokens: 1180, status: "ocr-pending" },
  { id: "cad_01JB4XC1", file: "call-recording.mp3", type: "MP3", pages: 0, tokens: 0, status: "extracting" },
  { id: "cad_01JB4XD4", file: "payload.zip", type: "ZIP", pages: 0, tokens: 0, status: "failed" },
];

const STATUS_TONE = { ready: "healthy", failed: "down", "ocr-pending": "degraded", extracting: "info", embedding: "info", uploaded: "neutral" } as const;

export default function DocumentPoliciesPage() {
  const [selected, setSelected] = useState(POLICIES[0].name);
  const [formats, setFormats] = useState<Set<string>>(new Set(["PDF", "DOCX", "XLSX", "CSV", "PPTX", "MD", "TXT", "PNG", "JPG"]));
  const [maxMb, setMaxMb] = useState("50");
  const [maxPages, setMaxPages] = useState("500");
  const [maxFiles, setMaxFiles] = useState("10");
  const [maxOcrPages, setMaxOcrPages] = useState("100");
  const [maxImages, setMaxImages] = useState("50");
  const [denyPw, setDenyPw] = useState(true);
  const [allowImages, setAllowImages] = useState(true);
  const [onBreach, setOnBreach] = useState<"warn" | "throttle" | "block">("block");
  const [maxTokens, setMaxTokens] = useState("200000");
  const [ocr, setOcr] = useState("auto");
  const [ocrLangs, setOcrLangs] = useState("eng, ara");
  const [pii, setPii] = useState<"off" | "detect" | "mask" | "block">("mask");
  const [malware, setMalware] = useState(true);
  const [embed, setEmbed] = useState(true);
  const [cache, setCache] = useState(true);
  const [retention, setRetention] = useState("30");
  const [saved, setSaved] = useState(false);

  const flip = (f: string) =>
    setFormats((prev) => {
      const n = new Set(prev);
      n.has(f) ? n.delete(f) : n.add(f);
      return n;
    });

  return (
    <SampleGate title="Document Policies" description="Control which files applications may send, how they are scanned and redacted, and how much of a document may be spent on a single request.">
      <PageHeader
        title="Document Policies"
        description="Control which files applications may send, how they are scanned and redacted, and how much of a document may be spent on a single request."
        action={<Button variant="primary"><Plus size={15} /> New document policy</Button>}
      />

      <div className="flex flex-col gap-5">
        <Card>
          <Table>
            <Thead>
              <tr>
                <Th>Policy</Th>
                <Th>Applies to</Th>
                <Th>Formats</Th>
                <Th>Max size</Th>
                <Th>PII</Th>
                <Th>Status</Th>
              </tr>
            </Thead>
            <tbody>
              {POLICIES.map((p) => (
                <Tr key={p.name}>
                  <Td>
                    <button onClick={() => setSelected(p.name)} className={clsx("font-mono text-[13px] hover:underline", selected === p.name ? "text-text-primary font-semibold" : "text-text-secondary")}>
                      {p.name}
                    </button>
                  </Td>
                  <Td className="font-mono text-xs text-text-secondary">{p.scope}</Td>
                  <Td>{p.formats}</Td>
                  <Td>{p.maxMb} MB</Td>
                  <Td><Badge tone={p.pii === "block" ? "down" : p.pii === "mask" ? "healthy" : "info"}>{p.pii}</Badge></Td>
                  <Td><Badge tone={p.status === "active" ? "healthy" : "neutral"}>{p.status}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader title={`Editing ${selected}`} subtitle="Accepted file types (allow-list planned, the processor currently accepts every supported format)" />
              <CardBody className="flex flex-col gap-4">
                {FORMAT_GROUPS.map((g) => (
                  <div key={g.label}>
                    <div className="text-xs text-text-tertiary mb-1.5">{g.label}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.items.map((f) => {
                        const on = formats.has(f);
                        return (
                          <button
                            key={f}
                            type="button"
                            onClick={() => flip(f)}
                            aria-pressed={on}
                            className={clsx(
                              "h-7 px-2.5 rounded text-xs font-mono border transition-colors",
                              on ? "bg-emph text-on-emph border-emph" : "bg-surface text-text-secondary border-border-strong hover:bg-surface-muted"
                            )}
                          >
                            {f}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Limits" subtitle="Enforced before any provider call, so oversized files cost nothing." />
              <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Max file size (MB)"><Input type="number" value={maxMb} onChange={(e) => setMaxMb(e.target.value)} /></Field>
                <Field label="Max pages per document"><Input type="number" value={maxPages} onChange={(e) => setMaxPages(e.target.value)} /></Field>
                <Field label="Max OCR pages"><Input type="number" value={maxOcrPages} onChange={(e) => setMaxOcrPages(e.target.value)} /></Field>
                <Field label="Max images per document"><Input type="number" value={maxImages} onChange={(e) => setMaxImages(e.target.value)} /></Field>
                <Field label="Max files per request (planned)"><Input type="number" value={maxFiles} onChange={(e) => setMaxFiles(e.target.value)} /></Field>
                <Field label="Max tokens per document" hint="Documents estimated above this are denied or truncated.">
                  <Input type="number" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} />
                </Field>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Processing" subtitle="OCR languages, password protection, images, and breach action are enforced today. PII handling, retention, and format allow-lists are planned." />
              <CardBody className="divide-y divide-border">
                <div className="pb-4">
                  <Toggle checked={denyPw} onChange={setDenyPw} label="Deny password-protected files" description="Encrypted PDFs and archives cannot be read, so they are refused." />
                  <Toggle checked={allowImages} onChange={setAllowImages} label="Allow embedded and standalone images" />
                  <div className="pt-3">
                    <span className="block text-[13px] font-medium text-text-primary mb-1.5">On breach</span>
                    <Segmented value={onBreach} onChange={setOnBreach} options={[{ value: "warn", label: "Warn" }, { value: "throttle", label: "Throttle" }, { value: "block", label: "Block" }]} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4">
                  <Field label="OCR">
                    <Select value={ocr} onChange={(e) => setOcr(e.target.value)}>
                      <option value="auto">Auto, only when text is missing</option>
                      <option value="force">Always</option>
                      <option value="off">Off</option>
                    </Select>
                  </Field>
                  <Field label="OCR languages"><Input value={ocrLangs} onChange={(e) => setOcrLangs(e.target.value)} /></Field>
                </div>
                <div className="py-4">
                  <span className="block text-[13px] font-medium text-text-primary mb-1.5">PII handling (planned)</span>
                  <Segmented
                    value={pii}
                    onChange={setPii}
                    options={[
                      { value: "off", label: "Off" },
                      { value: "detect", label: "Detect and log" },
                      { value: "mask", label: "Mask" },
                      { value: "block", label: "Block request" },
                    ]}
                  />
                </div>
                <Toggle checked={malware} onChange={setMalware} label="Malware scan required" description="Files that fail the scan are quarantined and never reach a provider." />
                <Toggle checked={embed} onChange={setEmbed} label="Embed for retrieval" description="Chunk and embed documents so applications can ground answers in them." />
                <Toggle checked={cache} onChange={setCache} label="Reuse processed documents" description="Identical files, by SHA-256, skip extraction on later requests." />
                <div className="pt-4 max-w-xs">
                  <Field label="Retention (days, planned)" hint="Raw files and extracted text are deleted after this period.">
                    <Input type="number" value={retention} onChange={(e) => setRetention(e.target.value)} />
                  </Field>
                </div>
              </CardBody>
            </Card>

            <div className="flex items-center gap-3">
              <Button variant="primary" onClick={() => setSaved(true)}>Save policy</Button>
              <Button variant="ghost">Discard changes</Button>
              {saved && <span className="text-sm text-status-healthy">Saved locally. Connect the API to persist.</span>}
            </div>
          </div>

          <div className="flex flex-col gap-5 xl:sticky xl:top-24">
            <Card>
              <CardHeader title="Pipeline preview" subtitle="Reflects the toggles on this page." />
              <CardBody>
                <div className="flex flex-col gap-0">
                  <Pipeline
                    vertical
                    steps={[
                      ...(malware ? [{ title: "Malware scan", detail: "Quarantine on detection", icon: ScanLine, reject: "quarantined" }] : []),
                      { title: ocr === "off" ? "Extract text" : "Extract and OCR", detail: ocr === "off" ? "Native text only" : `OCR: ${ocr}, ${ocrLangs}`, icon: FileText },
                      ...(pii !== "off" ? [{ title: pii === "block" ? "Block on PII" : pii === "mask" ? "Mask PII" : "Detect PII", detail: "Before storage", icon: Eraser, reject: pii === "block" ? "422 pii_detected" : undefined }] : []),
                      { title: "Limit check", detail: `${maxMb} MB, ${maxPages} pages, ${Number(maxTokens).toLocaleString()} tokens`, icon: ShieldCheck, reject: "413 document_too_large" },
                      ...(embed ? [{ title: "Embed", detail: "Chunk for retrieval", icon: Database, tone: "accent" as const }] : []),
                    ]}
                  />
                </div>
              </CardBody>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader
            title="Canonical AI Documents"
            subtitle="Processed files, one entry per unique content hash."
            action={<Button variant="secondary"><Upload size={15} /> Upload test file</Button>}
          />
          <Table>
            <Thead>
              <tr><Th>ID</Th><Th>File</Th><Th>Type</Th><Th>Pages</Th><Th>Tokens</Th><Th>Status</Th></tr>
            </Thead>
            <tbody>
              {CADS.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-mono text-xs text-text-secondary">{c.id}</Td>
                  <Td>{c.file}</Td>
                  <Td>{c.type}</Td>
                  <Td className="tabular-nums">{c.pages || "n/a"}</Td>
                  <Td className="tabular-nums">{c.tokens ? c.tokens.toLocaleString() : "n/a"}</Td>
                  <Td><Badge tone={STATUS_TONE[c.status as keyof typeof STATUS_TONE]}>{c.status}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </SampleGate>
  );
}
