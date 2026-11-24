const ROWS: [string, string, string][] = [
  ["auth", "key tok_live_8f2c...", "0.4ms"],
  ["policy", "approved-models v4, allow", "1.4ms"],
  ["budget", "project:recsys at 68% of $5,000", "1.1ms"],
  ["route", "anthropic / claude-sonnet, priority 1", "0.6ms"],
  ["meter", "1,204 in, 388 out, $0.0112", "async"],
];

/** A single request as the gateway sees it. Shows the product, not a decoration. */
export function HeroLedger() {
  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/80 backdrop-blur overflow-hidden font-mono text-[12.5px]">
      <div className="px-4 h-10 flex items-center justify-between border-b border-white/10 text-text-tertiary">
        <span>POST /v1/chat/completions</span>
        <span className="text-accent-500">200 OK</span>
      </div>
      <div className="p-4 flex flex-col gap-2.5">
        <div className="text-text-tertiary">model: <span className="text-text-inverse">chat-default</span></div>
        {ROWS.map(([k, v, t], i) => (
          <div key={k} className="tok-row tok-keep -mx-2 px-2 py-0.5 grid grid-cols-[14px_64px_1fr_auto] items-center gap-2 text-[#cfe3df]" style={{ animationDelay: `${i * 0.7}s` }}>
            <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
            <span className="text-text-tertiary">{k}</span>
            <span className="truncate">{v}</span>
            <span className="text-text-tertiary tabular-nums">{t}</span>
          </div>
        ))}
      </div>
      <div className="px-4 py-3 border-t border-white/10 text-text-tertiary flex justify-between">
        <span>request_id 01JBX4Q9</span>
        <span>total overhead 3.5ms</span>
      </div>
    </div>
  );
}
