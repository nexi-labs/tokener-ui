"use client";

import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Combine, Database, Search, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/mlops/ui";
import { ConnectorMark, fmtInt, fmtRows } from "@/components/refinery/bits";
import { Pager, pageCount } from "@/components/refinery/Pager";
import { CLEANINGS, JOIN_TYPES, connOf, runModel, type ModelResult } from "@/lib/refinery/model";
import type { Connection, Dataset, ModelJoin, ModelSpec } from "@/lib/refinery/types";

/**
 * The lineage of a unified dataset: the tables it reads, the join steps that relate them, the step that selects and cleans columns, and the result.
 * Select a step to see the tables it works on, and a table to see every column and how the result uses it.
 */

const NW = 172, NH = 78, GX = 48, GY = 26, PAD = 12;
type NodeKind = "table" | "join" | "select" | "output";
type GNode = { id: string; kind: NodeKind; col: number; row: number; alias?: string; join?: ModelJoin[]; step?: number };
type View = { kind: "op"; id: string } | { kind: "table"; alias: string; from?: string } | { kind: "out" } | null;

function layout(spec: ModelSpec): { nodes: GNode[]; edges: [string, string][]; cols: number; rows: number } {
  const n = Math.max(1, spec.sources.length);
  const nodes: GNode[] = []; const edges: [string, string][] = [];
  spec.sources.forEach((s, i) => nodes.push({ id: `t:${s.alias}`, kind: "table", col: 0, row: i, alias: s.alias }));
  let prev = `t:${spec.sources[0]?.alias}`;
  for (let k = 1; k < spec.sources.length; k++) {
    const s = spec.sources[k]; const id = `j:${s.alias}`;
    nodes.push({ id, kind: "join", col: k, row: k, alias: s.alias, join: spec.joins.filter((j) => j.rightAlias === s.alias), step: k });
    edges.push([prev, id], [`t:${s.alias}`, id]); prev = id;
  }
  nodes.push({ id: "select", kind: "select", col: n, row: n - 1 });
  edges.push([prev, "select"]);
  nodes.push({ id: "out", kind: "output", col: n + 1, row: n - 1 });
  edges.push(["select", "out"]);
  return { nodes, edges, cols: n + 2, rows: n };
}
const pos = (c: number, r: number) => ({ x: PAD + c * (NW + GX), y: PAD + r * (NH + GY) });

export function LineageGraph({ spec, datasets, connections, name, result }: { spec: ModelSpec; datasets: Dataset[]; connections: Connection[]; name: string; result?: ModelResult }) {
  const [view, setView] = useState<View>(null);
  const [hover, setHover] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth)); ro.observe(el); setAvail(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const res = useMemo(() => result ?? runModel(spec, datasets), [result, spec, datasets]);
  const g = useMemo(() => layout(spec), [spec]);
  const ds = (alias: string) => datasets.find((d) => d.id === spec.sources.find((s) => s.alias === alias)?.datasetId);
  const conn = (d?: Dataset) => connOf(d, connections);
  const used = (alias: string) => spec.columns.filter((c) => c.alias === alias);
  const W = PAD * 2 + g.cols * NW + (g.cols - 1) * GX, H = PAD * 2 + g.rows * NH + (g.rows - 1) * GY;
  const byId = new Map(g.nodes.map((x) => [x.id, x]));
  // Shrink a wide graph to fit, down to 70 percent. Beyond that the box scrolls.
  const scale = avail > 0 ? Math.max(0.7, Math.min(1, (avail - 2) / W)) : 1;
  const joinText = (js: ModelJoin[]) => js.map((j) => `${j.leftAlias}.${j.leftColumn} = ${j.rightAlias}.${j.rightColumn}`).join(" and ");
  const stat = (alias: string) => res.stats.find((s) => s.rightAlias === alias);

  const Node = ({ n }: { n: GNode }) => {
    const p = pos(n.col, n.row);
    const base = "absolute text-left rounded-lg border bg-surface shadow-card px-3 py-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#02F5A1]";
    const style = { left: p.x, top: p.y, width: NW, height: NH };
    const on = hover === n.id;
    if (n.kind === "table") {
      const d = ds(n.alias!); const c = conn(d);
      return (
        <button type="button" title={d?.name} style={style} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onClick={() => setView({ kind: "table", alias: n.alias! })} aria-label={`Table ${d?.name}. Show its columns`}
          className={clsx(base, on ? "border-border-strong" : "border-border")}>
          <div className="flex items-center gap-2.5 min-w-0">
            {c ? <ConnectorMark id={c.connector} size={28} /> : <div className="h-7 w-7 rounded-md bg-surface-muted grid place-items-center shrink-0"><Database size={14} className="text-text-secondary" /></div>}
            <div className="min-w-0"><div className="text-[12.5px] font-medium truncate">{d?.name ?? "removed dataset"}</div><div className="text-[11px] text-text-tertiary truncate">{c?.name ?? "uploaded"}</div></div>
          </div>
          <div className="mt-1.5 text-[11px] text-text-secondary tabular-nums">{used(n.alias!).length} of {d?.columns.length ?? 0} columns used</div>
        </button>);
    }
    if (n.kind === "output") {
      return (
        <button type="button" style={style} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onClick={() => setView({ kind: "out" })} aria-label="Result dataset. Show its columns"
          className={clsx(base, "border-[#02F5A1]/70", on && "border-[#02F5A1]")} >
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#02F5A1] shrink-0" /><span className="text-[12.5px] font-medium truncate">{name || "unified dataset"}</span></div>
          <div className="mt-1 text-[10.5px] text-text-tertiary">Result dataset</div>
          <div className="text-[11px] text-text-secondary tabular-nums truncate">{spec.columns.length} columns, {fmtRows(res.estRows)} rows</div>
        </button>);
    }
    const isJoin = n.kind === "join";
    const st = isJoin ? stat(n.alias!) : undefined;
    return (
      <button type="button" style={style} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onClick={() => setView({ kind: "op", id: n.id })} aria-label={isJoin ? `Join step ${n.step}. Show its tables` : "Select and clean step. Show its tables"}
        className={clsx(base, "bg-surface-subtle", on ? "border-border-strong" : "border-border-strong/60")}>
        <div className="flex items-center gap-2 text-[12.5px] font-medium">{isJoin ? <Combine size={14} className="text-text-secondary shrink-0" /> : <SlidersHorizontal size={14} className="text-text-secondary shrink-0" />}{isJoin ? `Join ${n.step}` : "Select and clean"}</div>
        <div className="mt-1 text-[11px] text-text-secondary truncate">{isJoin ? (n.join?.length ? joinText(n.join) : "No columns chosen") : `${spec.columns.length} columns${spec.dropDuplicates ? ", no duplicates" : ""}`}</div>
        <div className="text-[10.5px] text-text-tertiary tabular-nums truncate">{isJoin ? (st ? `${fmtInt(st.matchedLeft)} of ${fmtInt(st.leftRows)} rows matched` : "") : `${spec.columns.filter((c) => c.clean !== "none").length} cleaned`}</div>
      </button>);
  };

  return (
    <>
      <div ref={box} className="overflow-x-auto rounded-md border border-border bg-surface-subtle/40">
        <div style={{ width: W * scale, height: H * scale }}>
        <div className="relative origin-top-left" style={{ width: W, height: H, transform: scale < 1 ? `scale(${scale})` : undefined }}>
          <svg width={W} height={H} className="absolute inset-0 pointer-events-none" aria-hidden>
            {g.edges.map(([a, b]) => {
              const A = byId.get(a)!, B = byId.get(b)!; const pa = pos(A.col, A.row), pb = pos(B.col, B.row);
              const x1 = pa.x + NW, y1 = pa.y + NH / 2, x2 = pb.x, y2 = pb.y + NH / 2; const dx = Math.max(24, (x2 - x1) / 2);
              const hot = hover === a || hover === b;
              return (<g key={`${a}-${b}`}><path d={`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`} fill="none" strokeWidth={hot ? 2 : 1.5} className={hot ? "stroke-[#0a8f64]" : "stroke-border-strong"} /><circle cx={x2} cy={y2} r={3} className={hot ? "fill-[#0a8f64]" : "fill-border-strong"} /></g>);
            })}
          </svg>
          {g.nodes.map((n) => <Node key={n.id} n={n} />)}
        </div>
        </div>
      </div>
      <p className="text-xs text-text-tertiary mt-2">Select a step to see the tables it works on. Select a table to see all of its columns.</p>
      <LineagePopup view={view} setView={setView} spec={spec} datasets={datasets} connections={connections} name={name} res={res} g={g} />
    </>
  );
}

function LineagePopup({ view, setView, spec, datasets, connections, name, res, g }: { view: View; setView: (v: View) => void; spec: ModelSpec; datasets: Dataset[]; connections: Connection[]; name: string; res: ModelResult; g: ReturnType<typeof layout> }) {
  const ds = (alias: string) => datasets.find((d) => d.id === spec.sources.find((s) => s.alias === alias)?.datasetId);
  const conn = (d?: Dataset) => connOf(d, connections);
  const close = () => setView(null);
  const op = view?.kind === "op" ? g.nodes.find((n) => n.id === view.id) : undefined;
  const title = !view ? "" : view.kind === "out" ? `Result: ${name || "unified dataset"}` : view.kind === "table" ? `Table ${ds(view.alias)?.name ?? view.alias}` : op?.kind === "join" ? `Join ${op.step}` : "Select and clean";
  return (
    <Modal open={!!view} onClose={close} wide title={title}>
      {view?.kind === "op" && op && <OperatorView op={op} spec={spec} datasets={datasets} connections={connections} res={res} open={(alias) => setView({ kind: "table", alias, from: op.id })} />}
      {view?.kind === "table" && <TableView alias={view.alias} spec={spec} d={ds(view.alias)} c={conn(ds(view.alias))} back={view.from ? { label: view.from === "select" ? "Select and clean" : `Join ${g.nodes.find((n) => n.id === view.from)?.step}`, go: () => setView({ kind: "op", id: view.from! }) } : undefined} />}
      {view?.kind === "out" && <OutputView spec={spec} datasets={datasets} res={res} />}
    </Modal>
  );
}

function TableRow({ alias, d, c, role, extra, onClick }: { alias: string; d?: Dataset; c?: Connection; role: string; extra: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 rounded-md border border-border px-3.5 py-3 text-left hover:bg-surface-subtle">
      {c ? <ConnectorMark id={c.connector} size={34} /> : <div className="h-[34px] w-[34px] rounded-md bg-surface-muted grid place-items-center shrink-0"><Database size={16} className="text-text-secondary" /></div>}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><span className="text-[13px] font-medium truncate">{d?.name ?? "removed dataset"}</span><span className="font-mono text-[11px] text-text-tertiary">{alias}</span><Badge tone="neutral">{role}</Badge></div>
        <div className="text-xs text-text-tertiary mt-0.5 truncate">{c?.name ?? "uploaded"}{d ? `, ${fmtRows(d.totalRows)} rows` : ""}. {extra}</div>
      </div>
      <ChevronRight size={16} className="text-text-tertiary shrink-0" />
    </button>);
}

function OperatorView({ op, spec, datasets, connections, res, open }: { op: GNode; spec: ModelSpec; datasets: Dataset[]; connections: Connection[]; res: ModelResult; open: (alias: string) => void }) {
  const ds = (alias: string) => datasets.find((d) => d.id === spec.sources.find((s) => s.alias === alias)?.datasetId);
  const conn = (d?: Dataset) => connOf(d, connections);
  if (op.kind === "join") {
    const k = op.step!; const js = op.join ?? []; const first = js[0]; const st = res.stats.find((s) => s.rightAlias === op.alias);
    const tables = spec.sources.slice(0, k + 1);
    return (
      <div className="space-y-4">
        <p className="text-[13px] text-text-secondary">{first ? <>Combines the result so far with <b className="font-medium text-text-primary">{ds(op.alias!)?.name}</b>. {JOIN_TYPES.find((t) => t.id === first.type)?.hint}</> : "No matching columns are chosen for this step yet."}</p>
        {js.length > 0 && <div className="rounded-md bg-surface-subtle px-3.5 py-3 text-xs space-y-1">
          <div className="text-text-tertiary">Rows match when</div>
          {js.map((j) => <div key={j.id} className="font-mono text-[12px]">{j.leftAlias}.{j.leftColumn} = {j.rightAlias}.{j.rightColumn}{j.normalise ? <span className="text-text-tertiary font-sans"> (trimmed, not case sensitive)</span> : null}</div>)}
        </div>}
        {st && <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {[["Rows in", fmtInt(st.leftRows)], ["Matched", fmtInt(st.matchedLeft)], ["Rows out", fmtInt(st.outRows)], ["Matches per row", st.matchedLeft ? String(st.perMatch) : "none"]].map(([a, b]) => <div key={a} className="rounded-md border border-border px-3 py-2"><dt className="text-text-tertiary">{a}</dt><dd className="text-[15px] font-medium tabular-nums mt-0.5">{b}</dd></div>)}
        </dl>}
        {st && !st.rightKeyUnique && <p className="text-xs text-text-secondary">The key repeats in {ds(op.alias!)?.name}, so one row can match several. The row count can grow.</p>}
        <div>
          <h3 className="text-[13px] font-medium mb-2">Tables in this step</h3>
          <div className="space-y-2">{tables.map((s, i) => { const d = ds(s.alias); const n = spec.columns.filter((c) => c.alias === s.alias).length; return <TableRow key={s.alias} alias={s.alias} d={d} c={conn(d)} role={i === 0 ? "Base table" : i === k ? "Joined here" : `Joined in step ${i}`} extra={`${n} of ${d?.columns.length ?? 0} columns used.`} onClick={() => open(s.alias)} />; })}</div>
        </div>
        <p className="text-xs text-text-tertiary">Joins on samples are for checking the shape. In a connected workspace the join runs on a runner next to the data.</p>
      </div>);
  }
  const cleaned = spec.columns.filter((c) => c.clean !== "none");
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-text-secondary">Keeps {spec.columns.length} column{spec.columns.length === 1 ? "" : "s"}, renames them and applies the cleaning you chose{spec.dropDuplicates ? ", then removes rows that are exact duplicates" : ""}. {cleaned.length} column{cleaned.length === 1 ? " is" : "s are"} cleaned.</p>
      <div>
        <h3 className="text-[13px] font-medium mb-2">Tables in this step</h3>
        <div className="space-y-2">{spec.sources.map((s, i) => { const d = ds(s.alias); const cols = spec.columns.filter((c) => c.alias === s.alias); return <TableRow key={s.alias} alias={s.alias} d={d} c={conn(d)} role={i === 0 ? "Base table" : "Joined"} extra={cols.length ? `${cols.length} column${cols.length === 1 ? "" : "s"}: ${cols.slice(0, 4).map((c) => c.as).join(", ")}${cols.length > 4 ? ", ..." : ""}.` : "No column in the result."} onClick={() => open(s.alias)} />; })}</div>
      </div>
    </div>);
}

function TableView({ alias, spec, d, c, back }: { alias: string; spec: ModelSpec; d?: Dataset; c?: Connection; back?: { label: string; go: () => void } }) {
  const [q, setQ] = useState(""); const [page, setPage] = useState(0); const [size, setSize] = useState(10);
  const keys = new Set(spec.joins.flatMap((j) => [j.leftAlias === alias ? j.leftColumn : "", j.rightAlias === alias ? j.rightColumn : ""]).filter(Boolean));
  const list = (d?.columns ?? []).filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()));
  const pages = pageCount(list.length, size); const p = Math.min(page, pages - 1);
  const loc = d?.source.kind === "connection" ? d.source.location : d?.source.kind === "query" ? "saved query" : d?.source.kind === "upload" ? d.source.fileName : d?.source.kind === "documents" ? d.source.folder : "";
  return (
    <div className="space-y-4">
      {back && <button type="button" onClick={back.go} className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"><ArrowLeft size={13} /> Back to {back.label}</button>}
      <div className="flex items-center gap-3">
        {c ? <ConnectorMark id={c.connector} size={38} /> : <div className="h-[38px] w-[38px] rounded-md bg-surface-muted grid place-items-center"><Database size={17} className="text-text-secondary" /></div>}
        <div className="min-w-0"><div className="text-sm font-medium truncate">{d?.name ?? "removed dataset"} <span className="font-mono text-xs text-text-tertiary">{alias}</span></div><div className="text-xs text-text-tertiary truncate">{c?.name ?? "uploaded"}{loc ? `: ${loc}` : ""}. {d ? `${fmtInt(d.totalRows)} rows, ${d.columns.length} columns.` : ""}</div></div>
      </div>
      <div className="relative max-w-xs"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" /><input aria-label="Search columns" placeholder="Search columns" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-2 text-xs placeholder:text-text-tertiary focus:outline-none focus:border-border-strong" /></div>
      <div className="rounded-md border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-surface-subtle"><tr>{["Column", "Type", "Empty", "Distinct", "In the result"].map((h) => <th key={h} className="px-3 py-2 text-left font-medium text-text-secondary whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {list.slice(p * size, p * size + size).map((col) => {
                const pr = d?.profile.columns.find((x) => x.name === col.name); const sel = spec.columns.find((x) => x.alias === alias && x.column === col.name);
                return (<tr key={col.name} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap"><span className="font-medium">{col.name}</span>{keys.has(col.name) && <span className="ml-2"><Badge tone="info">Join key</Badge></span>}{pr?.pii && <span className="ml-2"><Badge tone="degraded">Personal data</Badge></span>}</td>
                  <td className="px-3 py-2 text-text-secondary">{col.type}</td>
                  <td className="px-3 py-2 tabular-nums text-text-secondary">{pr ? `${pr.nullPct}%` : ""}</td>
                  <td className="px-3 py-2 tabular-nums text-text-secondary">{pr ? fmtInt(pr.distinct) : ""}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{sel ? <span>as <span className="font-mono">{sel.as}</span>{sel.clean !== "none" ? <span className="text-text-tertiary">, {CLEANINGS.find((x) => x.id === sel.clean)?.label.toLowerCase()}</span> : null}</span> : <span className="text-text-tertiary">Not used</span>}</td>
                </tr>);
              })}
              {list.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-text-secondary">No column matches.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={p} pages={pages} size={size} total={list.length} filteredFrom={d?.columns.length} onPage={setPage} onSize={(n) => { setSize(n); setPage(0); }} sizes={[10, 25, 50]} />
      </div>
    </div>);
}

function OutputView({ spec, datasets, res }: { spec: ModelSpec; datasets: Dataset[]; res: ModelResult }) {
  const [page, setPage] = useState(0); const [size, setSize] = useState(10);
  const pages = pageCount(spec.columns.length, size); const p = Math.min(page, pages - 1);
  const dn = (alias: string) => datasets.find((d) => d.id === spec.sources.find((s) => s.alias === alias)?.datasetId)?.name ?? alias;
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-text-secondary">{spec.columns.length} columns, about {fmtInt(res.estRows)} rows in all. This figure is scaled from the sample, so treat it as an estimate.</p>
      <div className="rounded-md border border-border overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-[12px]">
          <thead className="bg-surface-subtle"><tr>{["Column", "Type", "Comes from", "Cleaning"].map((h) => <th key={h} className="px-3 py-2 text-left font-medium text-text-secondary">{h}</th>)}</tr></thead>
          <tbody>{spec.columns.slice(p * size, p * size + size).map((c) => <tr key={c.id} className="border-t border-border"><td className="px-3 py-2 font-medium font-mono">{c.as}</td><td className="px-3 py-2 text-text-secondary">{c.type}</td><td className="px-3 py-2 text-text-secondary">{dn(c.alias)}.{c.column}</td><td className="px-3 py-2 text-text-secondary">{CLEANINGS.find((x) => x.id === c.clean)?.label}</td></tr>)}</tbody>
        </table></div>
        <Pager page={p} pages={pages} size={size} total={spec.columns.length} onPage={setPage} onSize={(n) => { setSize(n); setPage(0); }} sizes={[10, 25, 50]} />
      </div>
    </div>);
}
