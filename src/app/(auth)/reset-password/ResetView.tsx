"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, MailCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { FormAlert, PasswordField, SubmitButton, TextField } from "@/components/auth/fields";
import { ApiError, authApi, passwordProblem } from "@/lib/auth/client";

/** Without a token: ask for a link. With ?token=: choose a new password. */
export function ResetView() {
  const token = useSearchParams().get("token");
  return token ? <Choose token={token} /> : <Request />;
}

function Request() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setBusy(true);
    try { await authApi.forgotPassword(email.trim()); setSent(true); }
    catch (err) { setError(err instanceof ApiError ? (err.status === 429 ? "Too many requests. Try again in a few minutes." : err.message) : "Something went wrong. Try again."); }
    finally { setBusy(false); }
  };

  if (sent) {
    return (
      <AuthShell aside="recovery" title="Check your email" footer={<Link href="/login" className="underline underline-offset-4">Back to sign in</Link>}>
        <div className="flex flex-col items-center text-center">
          <span className="h-12 w-12 rounded-full bg-accent-500/15 text-accent-700 grid place-items-center"><MailCheck size={22} /></span>
          <p className="mt-4 text-sm text-text-secondary leading-relaxed">If an account exists for <strong className="text-text-primary">{email.trim()}</strong>, a reset link is on its way. It expires in 30 minutes. Accounts that sign in with Google or GitHub do not have a password to reset.</p>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell aside="recovery" title="Reset your password" subtitle="Enter your email and we will send you a link to choose a new one." footer={<Link href="/login" className="underline underline-offset-4">Back to sign in</Link>}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <FormAlert>{error}</FormAlert>}
        <TextField label="Email" type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <SubmitButton busy={busy}>Send reset link</SubmitButton>
      </form>
    </AuthShell>
  );
}

function Choose({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const pwError = touched ? passwordProblem(password) : null;
  const mismatch = touched && confirm !== password ? "The passwords do not match." : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setTouched(true); setError(null);
    if (passwordProblem(password) || confirm !== password) return;
    setBusy(true);
    try { await authApi.resetPassword(token, password); setDone(true); }
    catch (err) { setError(err instanceof ApiError ? (err.code === "invalid_token" ? "This link has expired or was already used. Ask for a new one." : err.message) : "Something went wrong. Try again."); }
    finally { setBusy(false); }
  };

  if (done) {
    return (
      <AuthShell aside="recovery" title="Password updated">
        <div className="flex flex-col items-center text-center">
          <span className="h-12 w-12 rounded-full bg-accent-500/15 text-accent-700 grid place-items-center"><CheckCircle2 size={22} /></span>
          <p className="mt-4 text-sm text-text-secondary">You were signed out everywhere. Sign in with the new password.</p>
          <Link href="/login" className="mt-6 w-full h-11 rounded-md bg-ink-800 text-text-inverse text-sm font-medium hover:bg-ink-700 inline-flex items-center justify-center">Sign in</Link>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell aside="recovery" title="Choose a new password">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <FormAlert>{error} {error.includes("new one") && <Link href="/reset-password" className="underline">Request a link</Link>}</FormAlert>}
        <PasswordField label="New password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={pwError} hint="At least 12 characters." />
        <PasswordField label="Confirm new password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={mismatch} />
        <SubmitButton busy={busy}>Update password</SubmitButton>
      </form>
    </AuthShell>
  );
}
