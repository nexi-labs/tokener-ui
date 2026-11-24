"use client";

import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, Download, Pause, Play, Search } from "lucide-react";
import type { LogLine } from "@/lib/refinery/types";

const LEVEL = { info: "text-[#C9D6D8]", warn: "text-[#F5B84B]", error: "text-[#FF8A8A]" } as const;
const clock = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`; };

/** A log as the runner wrote it: time, level, who wrote it, what it said. Follow the end while a run is live, pause to read, filter, search, download. */
export function LogConsole({ lines, live, name, className }: { lines: LogLine[]; live: boolean; name: string; className?: string }) {
  const [level, setLevel] = useState<"all" | "warn" | "error">("all");
  const [q, setQ] = useState("");
  const [follow, setFollow] = useState(true);
  const [paused, setPaused] = useState(false);
  const frozen = useRef(lines.length);
  useEffect(() => { if (!paused) frozen.current = lines.length; }, [lines.length, paused]);
  const visible = useMemo(() => lines.slice(0, paused ? frozen.current : lines.length).filter((l) => (level === "all" || (level === "warn" ? l.level !== "info" : l.level === "error")) && (!q || `${l.src} ${l.msg}`.toLowerCase().includes(q.toLowerCase()))), [lines, level, q, paused]);
  const end = useRef<HTMLDivElement>(null); const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (follow && !paused && box.current) box.current.scrollTop = box.current.scrollHeight; }, [visible.length, follow, paused]);
  const download = () => { const text = lines.map((l) => `${l.t} ${l.level.toUpperCase().padEnd(5)} ${l.src.padEnd(14)} ${l.msg}`).join("\n") + "\n"; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" })); a.download = `${name}.log`; a.click(); URL.revokeObjectURL(a.href); };
  const counts = { warn: lines.filter((l) => l.level === "warn").length, error: lines.filter((l) => l.level === "error").length };

  return (
    <div className={clsx("rounded-lg overflow-hidden border border-[#16343B] bg-[#07191E] flex flex-col", className)}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[#16343B] text-xs text-[#9FB4B8]">
        <div role="group" aria-label="Level" className="inline-flex rounded-md border border-[#1F434B] p-0.5">
          {([["all", "All"], ["warn", `Warnings ${counts.warn + counts.error}`], ["error", `Errors ${counts.error}`]] as const).map(([v, l]) => <button key={v} type="button" aria-pressed={level === v} onClick={() => setLevel(v)} className={clsx("rounded px-2 py-1", level === v ? "bg-[#12303A] text-white" : "hover:text-white")}>{l}</button>)}
        </div>
        <div className="relative"><Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2" /><input aria-label="Search the log" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-7 w-40 rounded-md bg-transparent border border-[#1F434B] pl-7 pr-2 text-white placeholder:text-[#6F878C] focus:outline-none focus:border-[#02F5A1]" /></div>
        <span className="ml-auto tabular-nums">{visible.length} of {lines.length} lines</span>
        {live && <button type="button" onClick={() => setPaused(!paused)} className="inline-flex items-center gap-1.5 rounded-md border border-[#1F434B] px-2 py-1 hover:text-white">{paused ? <Play size={12} /> : <Pause size={12} />}{paused ? "Resume" : "Pause"}</button>}
        {live && <button type="button" aria-pressed={follow} onClick={() => setFollow(!follow)} className={clsx("inline-flex items-center gap-1.5 rounded-md border px-2 py-1", follow ? "border-[#02F5A1] text-[#02F5A1]" : "border-[#1F434B] hover:text-white")}><ArrowDownToLine size={12} /> Follow</button>}
        <button type="button" onClick={download} className="inline-flex items-center gap-1.5 rounded-md border border-[#1F434B] px-2 py-1 hover:text-white"><Download size={12} /> Download</button>
      </div>
      <div ref={box} role="log" aria-live="off" className="flex-1 min-h-0 overflow-auto px-3 py-2 font-mono text-[12px] leading-[1.65]">
        {visible.map((l, k) => (
          <div key={k} className="flex gap-3 whitespace-pre-wrap break-words">
            <span className="text-[#5F787D] shrink-0 tabular-nums">{clock(l.t)}</span>
            <span className={clsx("shrink-0 w-[3.2rem] uppercase", l.level === "info" ? "text-[#5F787D]" : LEVEL[l.level])}>{l.level}</span>
            <span className="shrink-0 w-[7.5rem] truncate text-[#02F5A1]/80">{l.src}</span>
            <span className={LEVEL[l.level]}>{l.msg}</span>
          </div>))}
        {visible.length === 0 && <div className="text-[#6F878C] py-6 text-center font-sans text-sm">{lines.length === 0 ? "No lines yet." : "No lines match."}</div>}
        {live && !paused && <div className="text-[#02F5A1] mt-1 animate-pulse">▍</div>}
        <div ref={end} />
      </div>
    </div>
  );
}
