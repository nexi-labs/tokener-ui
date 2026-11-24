"use client";

import clsx from "clsx";
import { Check, Search, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Segmented } from "@/components/ui/Form";
import { NodeIcon } from "@/components/studio/icons";
import { Modal } from "@/components/mlops/ui";
import { BRANDS, GLYPHS, GROUPS, SVG_LIMITS, resolveIcon, sanitizeSvg, searchIcons, type StoredIcon, type SvgIcon } from "@/lib/icons/collection";

const labelOf = (v: StoredIcon | undefined) => (!v ? "No icon chosen" : "ref" in v ? resolveIcon(v.ref)?.title ?? "Unknown icon" : v.svg.title ?? "Uploaded icon");

/**
 * Where a platform admin chooses a connector's icon: the platform collection (real brand marks and generic glyphs), or a private SVG that is
 * checked and reduced to a single path before it is kept. The stored value is an id or a validated path, never markup.
 */
export function IconPicker({ value, onChange, label = "Icon", hint }: { value: StoredIcon | undefined; onChange: (v: StoredIcon) => void; label?: string; hint?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <span className="block text-[13px] font-medium text-text-primary mb-1.5">{label}</span>
      <button type="button" onClick={() => setOpen(true)} className="w-full h-12 rounded-md border border-border-strong bg-surface px-3 flex items-center gap-3 text-left hover:bg-surface-subtle focus:outline-none focus:ring-2 focus:ring-accent-500/40">
        <span className="h-8 w-8 rounded border border-border bg-surface-subtle grid place-items-center text-text-primary">
          {value ? <NodeIcon icon={value} size={20} /> : <Search size={16} className="text-text-tertiary" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm text-text-primary truncate">{labelOf(value)}</span>
          <span className="block text-xs text-text-tertiary">{value ? ("ref" in value ? "From the icon collection" : "Uploaded SVG") : "Choose from the collection or upload an SVG"}</span>
        </span>
        <span className="text-xs text-text-secondary">Change</span>
      </button>
      {hint && <span className="block text-xs text-text-tertiary mt-1.5">{hint}</span>}
      <PickerModal open={open} onClose={() => setOpen(false)} value={value} onPick={(v) => { onChange(v); setOpen(false); }} />
    </div>
  );
}

function PickerModal({ open, onClose, value, onPick }: { open: boolean; onClose: () => void; value: StoredIcon | undefined; onPick: (v: StoredIcon) => void }) {
  const [tab, setTab] = useState<"collection" | "upload">("collection");
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string>("all");
  const found = useMemo(() => searchIcons(q, group), [q, group]);
  const total = found.brands.length + found.glyphs.length;
  const selected = value && "ref" in value ? value.ref : undefined;

  return (
    <Modal open={open} onClose={onClose} title="Choose an icon" wide>
      <div className="space-y-3">
        <Segmented value={tab} onChange={setTab} options={[{ value: "collection", label: `Collection (${BRANDS.length + GLYPHS.length})` }, { value: "upload", label: "Upload SVG" }]} />
        {tab === "collection" ? (
          <>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" aria-hidden />
                <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, such as kafka, vault or payments" className="pl-8" aria-label="Search icons" />
              </div>
              <select aria-label="Group" value={group} onChange={(e) => setGroup(e.target.value)} className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm">
                <option value="all">All groups</option>
                {GROUPS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div className="max-h-[48vh] overflow-y-auto pr-1" role="listbox" aria-label="Icons">
              {found.glyphs.length > 0 && <Section title="Generic glyphs" hint="For systems that have no brand mark.">{found.glyphs.map((x) => <Cell key={x.id} id={x.id} title={x.title} on={selected === x.id} onPick={() => onPick({ ref: x.id })} />)}</Section>}
              {GROUPS.filter((gr) => gr !== "Generic glyphs").map((gr) => {
                const list = found.brands.filter((b) => b.group === gr);
                return list.length ? <Section key={gr} title={gr}>{list.map((b) => <Cell key={b.id} id={b.id} title={b.title} on={selected === b.id} onPick={() => onPick({ ref: b.id })} />)}</Section> : null;
              })}
              {total === 0 && <p className="py-10 text-center text-sm text-text-secondary">No icon matches. Use a generic glyph, or upload the system&apos;s own SVG.</p>}
            </div>
            <p className="text-xs text-text-tertiary">Brand marks come from simpleicons.org. Their owners keep the rights, so use a mark only for the product it names.</p>
          </>
        ) : <Upload3 onPick={onPick} />}
      </div>
    </Modal>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[11px] uppercase tracking-wide text-text-tertiary mb-1.5">{title}{hint && <span className="normal-case tracking-normal ml-2">{hint}</span>}</div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-1.5">{children}</div>
    </div>
  );
}

function Cell({ id, title, on, onPick }: { id: string; title: string; on: boolean; onPick: () => void }) {
  return (
    <button type="button" role="option" aria-selected={on} onClick={onPick} title={title}
      className={clsx("relative h-[74px] rounded-md border flex flex-col items-center justify-center gap-1.5 px-1 text-[11px] text-text-secondary hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent-500/50",
        on ? "border-accent-600 bg-accent-50" : "border-border")}>
      <NodeIcon icon={{ ref: id }} size={24} className="text-text-primary" />
      <span className="w-full truncate text-center">{title}</span>
      {on && <Check size={12} className="absolute top-1 right-1 text-accent-700" aria-hidden />}
    </button>
  );
}

function Upload3({ onPick }: { onPick: (v: StoredIcon) => void }) {
  const [hex, setHex] = useState("07191E");
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [icon, setIcon] = useState<SvgIcon>();
  const run = (t: string, h = hex) => {
    setText(t);
    if (!t.trim()) { setIcon(undefined); setError(undefined); return; }
    const r = sanitizeSvg(t, h);
    if (r.ok) { setIcon(r.icon); setError(undefined); } else { setIcon(undefined); setError(r.error); }
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">Use this for a system with no entry in the collection. The file is checked in your browser and reduced to one path. Scripts, styles, images, links, gradients, filters and transforms are refused, and the colour is set here, not taken from the file.</p>
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border-strong text-sm cursor-pointer hover:bg-surface-muted">
          <Upload size={14} aria-hidden /> Choose a file
          <input type="file" accept=".svg,image/svg+xml" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) run(await f.text()); e.target.value = ""; }} />
        </label>
        <span className="text-xs text-text-tertiary">SVG, up to {SVG_LIMITS.maxBytes / 1024} KB</span>
      </div>
      <Field label="Or paste the SVG source"><textarea value={text} onChange={(e) => run(e.target.value)} rows={6} spellCheck={false} className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-xs font-code focus:outline-none focus:ring-2 focus:ring-accent-500/40" placeholder={'<svg viewBox="0 0 24 24"><path d="M12 2 2 22h20z"/></svg>'} /></Field>
      <div className="flex items-end gap-3">
        <Field label="Colour"><Input value={hex} onChange={(e) => { const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6); setHex(v); if (text) run(text, v); }} className="w-28 font-code" aria-label="Icon colour as six hexadecimal digits" /></Field>
        <div className="h-12 w-12 rounded border border-border bg-surface-subtle grid place-items-center">{icon && <NodeIcon icon={{ svg: icon }} size={28} />}</div>
        <Button variant="primary" disabled={!icon} onClick={() => icon && onPick({ svg: icon })}>Use this icon</Button>
      </div>
      {error && <p role="alert" className="text-sm text-status-down">{error}</p>}
    </div>
  );
}
