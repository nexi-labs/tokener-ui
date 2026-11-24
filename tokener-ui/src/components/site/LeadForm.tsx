"use client";

import { useState } from "react";
import { Check } from "lucide-react";

export type FormField = {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "textarea" | "select";
  placeholder?: string;
  options?: string[];
  half?: boolean;
};

const control =
  "w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-600";

export function LeadForm({ fields, submit, success }: { fields: FormField[]; submit: string; success: string }) {
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="rounded-xl border border-border bg-surface-subtle p-8 text-center">
        <span className="mx-auto h-10 w-10 rounded-full bg-accent-500 text-ink-900 flex items-center justify-center mb-4"><Check size={20} /></span>
        <p className="text-text-primary font-medium">{success}</p>
        <p className="text-xs text-text-tertiary mt-2">Thanks. Our team replies within one business day.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); setDone(true); }}
      className="grid grid-cols-1 sm:grid-cols-2 gap-4"
    >
      {fields.map((f) => (
        <label key={f.name} className={f.half ? "block" : "block sm:col-span-2"}>
          <span className="block text-[13px] font-medium text-text-primary mb-1.5">{f.label}</span>
          {f.type === "textarea" ? (
            <textarea required name={f.name} rows={4} placeholder={f.placeholder} className={`${control} py-2.5`} />
          ) : f.type === "select" ? (
            <select required name={f.name} className={`${control} h-10`} defaultValue="">
              <option value="" disabled>Select</option>
              {f.options?.map((o) => <option key={o}>{o}</option>)}
            </select>
          ) : (
            <input required name={f.name} type={f.type ?? "text"} placeholder={f.placeholder} className={`${control} h-10`} />
          )}
        </label>
      ))}
      <button type="submit" className="sm:col-span-2 h-11 rounded-md bg-ink-800 text-text-inverse text-sm font-semibold hover:bg-ink-700 transition-colors">
        {submit}
      </button>
    </form>
  );
}
