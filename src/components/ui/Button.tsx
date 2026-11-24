import clsx from "clsx";

type Variant = "primary" | "secondary" | "ghost";

export function Button({
  variant = "secondary",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={clsx(
        "h-9 px-3.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed",
        variant === "primary" && "bg-emph text-on-emph hover:bg-emph-hover",
        variant === "secondary" && "border border-border-strong text-text-primary hover:bg-surface-muted",
        variant === "ghost" && "text-text-secondary hover:bg-surface-muted",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
