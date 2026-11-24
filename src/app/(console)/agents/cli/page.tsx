"use client";

import { useEffect, useRef, useState } from "react";
import { Notice } from "@/components/mlops/ui";
import { CLI_VERSION, HELP, runCommand } from "@/lib/agents/cli";

type Entry = { cmd: string; lines: string[]; error?: boolean };
const TRY = ["agents list", "approvals list", "evals run \"Refund decisions\"", "traces list --status error --limit 5", "workflows list", "memory list support-triage", "context list", "protocol example relay.task.create"];

export default function CliPage() {
  const [log, setLog] = useState<Entry[]>([{ cmd: "help", lines: HELP }]); const [line, setLine] = useState(""); const [hist, setHist] = useState<string[]>([]); const [pos, setPos] = useState(-1);
  const end = useRef<HTMLDivElement>(null); const input = useRef<HTMLInputElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [log]);
  const run = (c: string) => {
    if (!c.trim()) return; const r = runCommand(c); setHist((h) => [c, ...h]); setPos(-1); setLine("");
    setLog((l) => (r.clear ? [] : [...l, { cmd: c, lines: r.lines, error: r.error }]));
  };
  return (
    <>
      <div className="mb-6"><h1 className="text-xl font-semibold tracking-tight">CLI</h1><p className="text-sm text-text-secondary mt-1 max-w-2xl">The <code className="font-mono text-[13px]">tok</code> commands, run here against the sample workspace. Each command calls the same actions as the console, so the same rules apply. Use it to learn the commands before the released tool is available.</p></div>
      <div className="mb-4"><Notice tone="warn" title="Not the released CLI">The <code className="font-mono">tok</code> tool for your own terminal has not been released ({CLI_VERSION}). This shell changes only the sample workspace in this browser tab.</Notice></div>
      <div className="grid xl:grid-cols-[1fr_300px] gap-5 items-start">
        <div className="rounded-lg border border-border bg-[#07191E] text-[#E6F2EF] shadow-card overflow-hidden" onClick={() => input.current?.focus()}>
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/10 text-xs text-[#8FB0AA]"><span className="font-mono">tok shell</span><span className="ml-auto">Up and down arrows recall earlier commands</span></div>
          <div className="h-[560px] overflow-auto px-4 py-3 font-mono text-[13px] leading-relaxed" role="log" aria-live="polite">
            {log.map((e, i) => (
              <div key={i} className="mb-3"><div><span className="text-[#02F5A1]">tok</span> <span className="text-[#8FB0AA]">&gt;</span> {e.cmd}</div>{e.lines.map((l, j) => <div key={j} className={e.error ? "text-[#FF8A8A] whitespace-pre-wrap" : "whitespace-pre-wrap text-[#CFE3DF]"}>{l || " "}</div>)}</div>
            ))}
            <div className="flex items-center gap-2"><span className="text-[#02F5A1]">tok</span><span className="text-[#8FB0AA]">&gt;</span>
              <input ref={input} aria-label="Command" autoFocus spellCheck={false} autoComplete="off" value={line} onChange={(e) => setLine(e.target.value)} className="flex-1 bg-transparent outline-none caret-[#02F5A1]"
                onKeyDown={(e) => { if (e.key === "Enter") run(line); else if (e.key === "ArrowUp") { e.preventDefault(); const n = Math.min(hist.length - 1, pos + 1); if (n >= 0) { setPos(n); setLine(hist[n]); } } else if (e.key === "ArrowDown") { e.preventDefault(); const n = pos - 1; setPos(n); setLine(n >= 0 ? hist[n] : ""); } }} /></div>
            <div ref={end} />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface shadow-card"><div className="px-5 py-3 border-b border-border text-sm font-medium">Try one</div>
          <ul className="divide-y divide-border">{TRY.map((t) => <li key={t}><button onClick={() => run(t)} className="w-full text-left px-5 py-2.5 font-mono text-[12.5px] hover:bg-surface-subtle break-all">{t}</button></li>)}</ul></div>
      </div>
    </>
  );
}
