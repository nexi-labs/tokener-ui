"use client";

import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { FormAlert, SubmitButton, TextField } from "@/components/auth/fields";
import { ApiError, authApi } from "@/lib/auth/client";

/** For people whose organization already uses tok∑ner. An administrator of that organization approves the request. */
export default function RequestAccessPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setBusy(true);
    try { await authApi.requestAccess({ fullName: fullName.trim(), email: email.trim(), organization: organization.trim(), reason: reason.trim() }); setSent(true); }
    catch (err) { setError(err instanceof ApiError ? (err.status === 429 ? "Too many requests. Try again later." : err.message) : "Something went wrong. Try again."); }
    finally { setBusy(false); }
  };

  if (sent) {
    return (
      <AuthShell aside="access" title="Request received" footer={<Link href="/login" className="underline underline-offset-4">Back to sign in</Link>}>
        <div className="flex flex-col items-center text-center">
          <span className="h-12 w-12 rounded-full bg-accent-500/15 text-accent-700 grid place-items-center"><MailCheck size={22} /></span>
          <p className="mt-4 text-sm text-text-secondary leading-relaxed">An administrator of your organization reviews requests. When it is approved you receive an email with a link to set a password.</p>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell aside="access" title="Request access" subtitle="For people joining an organization that already uses tok∑ner. Starting something new? Sign up instead." wide
      footer={<>Starting a new organization? <Link href="/signup" className="font-medium text-ink-800 underline underline-offset-4">Sign up</Link></>}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <FormAlert>{error}</FormAlert>}
        <TextField label="Full name" autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <TextField label="Work email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Organization" required value={organization} onChange={(e) => setOrganization(e.target.value)} />
        <div>
          <label className="block text-[13px] font-medium text-text-primary mb-1.5" htmlFor="reason">What will you use it for?</label>
          <textarea id="reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-sm focus:outline-none focus:border-accent-600 focus:ring-1 focus:ring-accent-600" />
        </div>
        <SubmitButton busy={busy}>Request access</SubmitButton>
      </form>
    </AuthShell>
  );
}
