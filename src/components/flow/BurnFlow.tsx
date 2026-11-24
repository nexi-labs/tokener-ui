import clsx from "clsx";

/** Budget burn as a threshold ladder: where spend sits and what each rung does. */
export function BurnFlow({
  pct,
  warnAt,
  throttleAt,
  blockAt,
}: {
  pct: number;
  warnAt: number;
  throttleAt: number;
  blockAt: number;
}) {
  const marks = [
    { at: warnAt, label: "Warn", detail: "notify owners", tone: "bg-status-info" },
    { at: throttleAt, label: "Throttle", detail: "cap request rate", tone: "bg-status-degraded" },
    { at: blockAt, label: "Block", detail: "429 budget_exceeded", tone: "bg-status-down" },
  ];
  return (
    <div>
      <div className="relative h-3 rounded-full bg-surface-muted">
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent-500" style={{ width: `${Math.min(100, pct)}%` }} />
        {marks.map((m) => (
          <span
            key={m.label}
            className={clsx("absolute top-[-4px] h-5 w-0.5 rounded", m.tone)}
            style={{ left: `${Math.min(100, m.at)}%` }}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        {marks.map((m) => (
          <div key={m.label} className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-text-primary">
              <span className={clsx("h-2 w-2 rounded-full shrink-0", m.tone)} />
              <span className="truncate">{m.label} {m.at}%</span>
            </div>
            <div className="text-[10px] text-text-tertiary mt-0.5 leading-snug">{m.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
