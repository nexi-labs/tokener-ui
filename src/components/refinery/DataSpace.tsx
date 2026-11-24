"use client";

import clsx from "clsx";
import { Check, Copy, Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { Notice } from "@/components/mlops/ui";
import { Section } from "@/components/refinery/bits";
import { useServerSetting } from "@/lib/refinery/settingsSync";
import { SettingSyncNote } from "@/components/refinery/SettingSyncNote";
import { dataspaceKey, LICENCES, PURPOSES, blocked, checkOffer, loadTerms, offerFiles, offerZip, personalColumns, saveTerms, type OfferTerms } from "@/lib/refinery/dataspace";
import { loadModel, semanticsKey } from "@/lib/refinery/semantics";
import { loadPolicy, policyKey, placeOfConnection, type Judged } from "@/lib/refinery/sovereignty";
import { useRefinery } from "@/lib/refinery/store";
import type { Dataset } from "@/lib/refinery/types";

const lines = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

/** Offer a dataset through a data space connector: the terms, the checks, and the files to register. */
export function DataSpace({ dataset: d }: { dataset: Dataset }) {
  const { connections } = useRefinery();
  const [t, setT] = useState<OfferTerms>(() => loadTerms(d));
  const [partnersText, setPartnersText] = useState(""); const [kwText, setKwText] = useState(""); const [purposeText, setPurposeText] = useState("");
  const [file, setFile] = useState("asset.json"); const [copied, setCopied] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { const v = loadTerms(d); setT(v); setPartnersText(v.partners.join("\n")); setKwText(v.keywords.join(", ")); }, [d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tick, setTick] = useState(0);
  useServerSetting("datasets", d.id, "data-space", dataspaceKey(d.id), () => { const v = loadTerms(d); setT(v); setPartnersText(v.partners.join("\n")); setKwText(v.keywords.join(", ")); });
  useServerSetting("datasets", d.id, "semantics", semanticsKey(d.id), () => setTick((x) => x + 1));
  useServerSetting("org", "org", "data-location", policyKey, () => setTick((x) => x + 1));
  const change = (patch: Partial<OfferTerms>) => setT((cur) => { const next = { ...cur, ...patch }; saveTerms(d, next); return next; });

  const model = useMemo(() => loadModel(d), [d, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const where = useMemo<Judged | null>(() => {
    const pol = loadPolicy();
    if (d.source.kind === "connection" || d.source.kind === "query") { const c = connections.find((x) => x.id === (d.source as { connectionId: string }).connectionId); return c ? placeOfConnection(c, pol.places[`conn:${c.id}`]) : null; }
    return pol.platformPlace === "unknown" ? { where: "unknown", basis: "stored by tok∑ner, whose location is not set on the Data location screen" } : { where: pol.platformPlace, basis: "stored by tok∑ner, at the location set on the Data location screen" };
  }, [d, connections, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const found = useMemo(() => checkOffer(d, t, model), [d, t, model]);
  const files = useMemo(() => offerFiles(d, t, model, where), [d, t, model, where]);
  const stop = blocked(found); const pii = personalColumns(d);
  const shown = files.find((f) => f.name === file) ?? files[0];
  const togglePurpose = (x: string) => change({ purposes: t.purposes.includes(x) ? t.purposes.filter((y) => y !== x) : [...t.purposes, x] });
  const customPurposes = t.purposes.filter((x) => !PURPOSES.includes(x));

  const download = async () => {
    setBusy(true); try { const url = URL.createObjectURL(await offerZip(d, t, model, where)); const a = document.createElement("a"); a.href = url; a.download = `data-space-offer-${t.assetId}.zip`; a.click(); URL.revokeObjectURL(url); } finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(shown.content); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ } };

  return (
    <div className="space-y-5">
      <Notice title="Offer this dataset to another organisation">
        This prepares the files a data space connector (the Eclipse Dataspace Connector, as used in Catena-X) needs to offer the dataset on terms you set, plus a catalogue entry and a readable passport. Nothing is registered from here, and no connector has read these files yet.
      </Notice>
      <SettingSyncNote />

      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-5 items-start">
        <div className="space-y-5">
          <Section title="Who and where" hint="Written into the asset and the catalogue entry.">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Publishing organisation"><Input value={t.publisher} onChange={(e) => change({ publisher: e.target.value })} placeholder="Acme Industrial GmbH" /></Field>
              <Field label="Asset identifier" hint="Letters, digits and . _ ~ : -"><Input className="font-code" value={t.assetId} onChange={(e) => change({ assetId: e.target.value })} /></Field>
            </div>
            <div className="mt-4"><Field label="Address the connector reads the data from" hint="An https address. The connector uses its own secrets to reach it, so none is written here."><Input className="font-code" value={t.baseUrl} onChange={(e) => change({ baseUrl: e.target.value })} placeholder="https://edge.acme.example/data/v1/dataset" /></Field></div>
            <div className="mt-4"><Field label="Keywords" hint="Separated by commas."><Input value={kwText} onChange={(e) => { setKwText(e.target.value); change({ keywords: lines(e.target.value) }); }} placeholder="compressor, vibration" /></Field></div>
          </Section>

          <Section title="Terms of use" hint="Written as an ODRL policy the connector evaluates for each partner.">
            <div className="space-y-4">
              <Field label="Permitted purposes" hint="The data may only be used for these. Leave empty to not limit it.">
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Permitted purposes">
                  {[...PURPOSES, ...customPurposes].map((x) => { const on = t.purposes.includes(x); return (
                    <button key={x} type="button" aria-pressed={on} onClick={() => togglePurpose(x)} className={clsx("h-8 px-3 rounded-md border text-[13px] transition-colors", on ? "border-[#07191E] bg-[#02F5A1]/[0.18] font-medium" : "border-border hover:bg-surface-muted")}>{x}</button>); })}
                </div>
                <form className="flex gap-2 mt-2" onSubmit={(e) => { e.preventDefault(); const v = purposeText.trim(); if (v && !t.purposes.includes(v)) change({ purposes: [...t.purposes, v] }); setPurposeText(""); }}>
                  <Input aria-label="Another purpose" className="max-w-xs" value={purposeText} onChange={(e) => setPurposeText(e.target.value)} placeholder="Another purpose" />
                  <button type="submit" className="h-9 px-3 rounded-md border border-border text-[13px] hover:bg-surface-muted">Add</button>
                </form>
              </Field>
              <Field label="Partners" hint="One identifier per line, such as a Catena-X business partner number. Empty means any participant the connector accepts."><textarea aria-label="Partners" value={partnersText} onChange={(e) => { setPartnersText(e.target.value); change({ partners: lines(e.target.value) }); }} rows={3} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] font-code focus:outline-none focus:ring-2 focus:ring-[#02F5A1]/50" placeholder="BPNL000000000ABC" /></Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Licence"><Select value={t.licence} onChange={(e) => change({ licence: e.target.value as OfferTerms["licence"] })}>{LICENCES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</Select></Field>
                <Field label="Valid until" hint="Optional. The offer cannot be used after this day."><Input type="date" value={t.validUntil} onChange={(e) => change({ validUntil: e.target.value })} /></Field>
              </div>
              {t.licence === "custom" && <Field label="Address of your terms"><Input className="font-code" value={t.licenceUrl} onChange={(e) => change({ licenceUrl: e.target.value })} placeholder="https://acme.example/data-terms" /></Field>}
              <Toggle checked={t.noOnwardTransfer} onChange={(v) => change({ noOnwardTransfer: v })} label="Partners may not pass the data on" description="Written as a prohibition on distribution." />
              {pii.length > 0 && <Field label="Why personal data is offered" hint={`${pii.join(", ")} look like personal data. Say why they are offered and on what basis, or mask them in a pipeline first.`}><textarea aria-label="Why personal data is offered" value={t.personalDataNote} onChange={(e) => change({ personalDataNote: e.target.value })} rows={2} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#02F5A1]/50" /></Field>}
            </div>
          </Section>
        </div>

        <div className="space-y-5">
          <Section title="Checks" hint={stop ? "Fix the items marked as errors to export." : "Ready to export. Look at the warnings first."}>
            <ul className="space-y-2">
              {found.map((f, i) => <li key={i} className="flex gap-2.5 text-[13px]"><span className={clsx("mt-1.5 h-2 w-2 rounded-full shrink-0", f.level === "error" ? "bg-status-down" : f.level === "warn" ? "bg-status-degraded" : "bg-status-info")} aria-hidden /><span><span className="sr-only">{f.level}: </span>{f.text}</span></li>)}
              {found.length === 0 && <li className="text-[13px] text-text-secondary">Nothing to report.</li>}
            </ul>
          </Section>

          <Section title="Files" action={<div className="flex gap-2"><button type="button" onClick={copy} disabled={stop} className="h-8 px-3 rounded-md border border-border text-[13px] inline-flex items-center gap-1.5 hover:bg-surface-muted disabled:opacity-50">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}</button><button type="button" onClick={download} disabled={stop || busy} className="h-8 px-3 rounded-md bg-[#07191E] text-white text-[13px] inline-flex items-center gap-1.5 hover:bg-[#0c2a31] disabled:opacity-50"><Download className="h-3.5 w-3.5" />Download offer</button></div>}>
            <div className="flex flex-wrap gap-1.5 mb-3" role="tablist" aria-label="Files">
              {files.map((f) => <button key={f.name} role="tab" aria-selected={f.name === shown.name} onClick={() => setFile(f.name)} className={clsx("h-7 px-2.5 rounded-md border text-xs font-code transition-colors", f.name === shown.name ? "border-[#07191E] bg-[#02F5A1]/[0.18]" : "border-border hover:bg-surface-muted")}>{f.name}</button>)}
            </div>
            <pre className="max-h-[560px] overflow-auto rounded-md bg-[#07191E] text-[#d8f5ea] text-xs leading-relaxed p-4 font-code whitespace-pre-wrap break-words">{shown.content}</pre>
          </Section>
        </div>
      </div>
    </div>
  );
}
