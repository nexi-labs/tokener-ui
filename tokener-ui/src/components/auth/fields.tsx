"use client";

import clsx from "clsx";
import { AlertCircle, Check, ChevronDown, Eye, EyeOff, Loader2 } from "lucide-react";
import { useId, useState } from "react";

const control = "w-full h-11 rounded-md border border-border-strong bg-surface px-3.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-600 focus:ring-1 focus:ring-accent-600 transition-colors disabled:opacity-60";

export function TextField({ label, hint, error, className, ...input }: { label: string; hint?: string; error?: string | null } & React.InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const id = input.id ?? auto;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[13px] font-medium text-text-primary mb-1.5">{label}</label>
      <input id={id} aria-invalid={!!error} aria-describedby={error || hint ? `${id}-d` : undefined} {...input} className={clsx(control, error && "border-status-down")} />
      {(error || hint) && <p id={`${id}-d`} className={clsx("mt-1.5 text-xs", error ? "text-status-down" : "text-text-tertiary")}>{error || hint}</p>}
    </div>
  );
}

export function PasswordField({ label, hint, error, className, ...input }: { label: string; hint?: string; error?: string | null } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const auto = useId();
  const id = input.id ?? auto;
  const [show, setShow] = useState(false);
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[13px] font-medium text-text-primary mb-1.5">{label}</label>
      <div className="relative">
        <input id={id} type={show ? "text" : "password"} aria-invalid={!!error} aria-describedby={error || hint ? `${id}-d` : undefined} {...input} className={clsx(control, "pr-11", error && "border-status-down")} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
          className="absolute right-1 top-1 h-9 w-9 grid place-items-center rounded text-text-tertiary hover:text-text-primary">
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {(error || hint) && <p id={`${id}-d`} className={clsx("mt-1.5 text-xs", error ? "text-status-down" : "text-text-tertiary")}>{error || hint}</p>}
    </div>
  );
}

export function FormAlert({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "info" }) {
  if (!children) return null;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={clsx("flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-sm leading-snug",
      tone === "error" ? "border-status-down/30 bg-status-down/5 text-text-primary" : "border-border bg-surface-subtle text-text-secondary")}>
      {tone === "error" && <AlertCircle size={16} className="mt-0.5 shrink-0 text-status-down" />}
      <div>{children}</div>
    </div>
  );
}

export function SubmitButton({ busy, children, className }: { busy?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <button type="submit" disabled={busy} className={clsx("w-full h-11 rounded-md bg-ink-800 text-text-inverse font-medium text-sm hover:bg-ink-700 disabled:opacity-70 transition-colors inline-flex items-center justify-center gap-2", className)}>
      {busy && <Loader2 size={15} className="animate-spin" />}{children}
    </button>
  );
}

export function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 my-6" role="separator">
      <div className="h-px flex-1 bg-border" /><span className="text-xs text-text-tertiary">{children}</span><div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function SelectField({ label, hint, error, className, children, ...select }: { label: string; hint?: string; error?: string | null } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId();
  const id = select.id ?? auto;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[13px] font-medium text-text-primary mb-1.5">{label}</label>
      <div className="relative">
        <select id={id} aria-invalid={!!error} aria-describedby={error || hint ? `${id}-d` : undefined} {...select}
          className={clsx(control, "appearance-none pr-10 cursor-pointer", !select.value && "text-text-tertiary", error && "border-status-down")}>
          {children}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" aria-hidden />
      </div>
      {(error || hint) && <p id={`${id}-d`} className={clsx("mt-1.5 text-xs", error ? "text-status-down" : "text-text-tertiary")}>{error || hint}</p>}
    </div>
  );
}

/** A checkbox whose label can carry links. The box is a real input, so it is keyboard and screen reader friendly. */
export function CheckboxField({ checked, onChange, error, children, id: given }: { checked: boolean; onChange: (v: boolean) => void; error?: string | null; children: React.ReactNode; id?: string }) {
  const auto = useId();
  const id = given ?? auto;
  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="relative mt-0.5 h-[18px] w-[18px] shrink-0">
          <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={!!error} aria-describedby={error ? `${id}-d` : undefined}
            className={clsx("peer absolute inset-0 h-full w-full appearance-none rounded border bg-surface cursor-pointer transition-colors checked:bg-ink-800 checked:border-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60", error ? "border-status-down" : "border-border-strong")} />
          <Check size={13} strokeWidth={3} className="pointer-events-none absolute left-[2.5px] top-[2.5px] text-accent-500 opacity-0 peer-checked:opacity-100" aria-hidden />
        </span>
        <label htmlFor={id} className="text-[13px] leading-snug text-text-secondary cursor-pointer">{children}</label>
      </div>
      {error && <p id={`${id}-d`} className="mt-1.5 ml-[30px] text-xs text-status-down">{error}</p>}
    </div>
  );
}

/** A plain-language read on a password as it is typed: how long it is and whether it is long enough. The server remains the authority. */
export function PasswordMeter({ value, min }: { value: string; min: number }) {
  const n = value.length;
  const level = n === 0 ? 0 : n < min ? 1 : n < min + 6 ? 2 : 3;
  const label = ["", `${min - n} more character${min - n === 1 ? "" : "s"} needed`, "Long enough", "Strong"][level];
  return (
    <div aria-live="polite" className="mt-2">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3].map((i) => <span key={i} className={clsx("h-1 flex-1 rounded-full transition-colors", level >= i ? (level === 1 ? "bg-status-degraded" : "bg-accent-600") : "bg-border")} />)}
      </div>
      <p className="mt-1.5 text-xs text-text-tertiary h-4">{label}</p>
    </div>
  );
}
