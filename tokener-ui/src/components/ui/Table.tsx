import clsx from "clsx";

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-surface-subtle border-b border-border">{children}</thead>;
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={clsx("text-left font-medium text-text-tertiary text-xs uppercase tracking-wide px-5 py-2.5", className)}>
      {children}
    </th>
  );
}

export function Td({ children, className, colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={clsx("px-5 py-3.5 text-text-primary border-b border-border", className)}>{children}</td>;
}

export function Tr({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return <tr onClick={onClick} className={clsx("hover:bg-surface-subtle transition-colors", className)}>{children}</tr>;
}
