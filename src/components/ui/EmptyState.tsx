import type { LucideIcon } from "lucide-react";

/** "An empty screen is an invitation to act" and never a bare "no data" message. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="h-11 w-11 rounded-full bg-surface-muted flex items-center justify-center mb-4">
        <Icon size={20} className="text-text-tertiary" strokeWidth={1.75} />
      </div>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <p className="text-sm text-text-secondary mt-1 max-w-sm">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
