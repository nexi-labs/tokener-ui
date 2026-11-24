"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Building2, Loader2, Mail } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { FormAlert, PasswordField, PasswordMeter, SubmitButton } from "@/components/auth/fields";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ApiError, PASSWORD_MIN_LENGTH, authApi, passwordProblem } from "@/lib/auth/client";

type State = { k: "checking" } | { k: "ready"; email: string; fullName: string; organization: string } | { k: "failed"; message: string };

/**
 * Where the link in the sign-up email lands. The link says who it is for, and the person chooses a password here: no password is ever taken
 * before the address is proven, so the only person who can finish a sign up is the one who controls the mailbox. The link works once.
 */
export function VerifyEmailView() {
  const token = useSearchParams().get("token");
  const router = useRouter();
  const { adopt } = useAuth();
  const [state, setState] = useState<State>({ k: "checking" });
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const looked = useRef(false);

  useEffect(() => {
    if (!token) { setState({ k: "failed", message: "This link is missing its token." }); return; }
    if (looked.current) return; // React strict mode runs effects twice in development
    looked.current = true;
    authApi.inspectVerification(token)
      .then((p) => setState({ k: "ready", ...p }))
      .catch((err) => setState({ k: "failed", message: err instanceof ApiError && err.code === "invalid_token" ? "This link has expired or was already used." : err instanceof ApiError ? err.message : "Something went wrong. Try again." }));
  }, [token]);

  if (state.k === "failed") {
    return (
      <AuthShell title="We could not open that link" footer={<Link href="/login" className="underline underline-offset-4">Back to sign in</Link>}>
        <FormAlert>{state.message}</FormAlert>
        <p className="mt-4 text-sm text-text-secondary leading-relaxed">Links work once and expire after 24 hours. <Link href="/signup" className="font-medium text-ink-800 underline underline-offset-4 hover:text-accent-700">Sign up again</Link> to get a new one.</p>
      </AuthShell>
    );
  }
  if (state.k === "checking") {
    return (
      <AuthShell title="Opening your link">
        <div className="flex items-center gap-2.5 text-sm text-text-secondary py-4"><Loader2 size={16} className="animate-spin" /> One moment</div>
      </AuthShell>
    );
  }

  const pwError = touched ? passwordProblem(password) : null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setTouched(true); setError(null);
    if (passwordProblem(password)) return;
    setBusy(true);
    try {
      adopt(await authApi.verifyEmail(token!, password));
      router.replace("/dashboard");
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiError ? (err.code === "invalid_token" ? "This link has expired or was already used. Sign up again to get a new one." : err.message) : "Something went wrong. Try again.");
    }
  };

  const first = state.fullName.split(/\s+/)[0] || state.fullName;
  return (
    <AuthShell title={`Welcome, ${first}`} subtitle="Choose a password to finish creating your account.">
      <div className="rounded-lg border border-border bg-surface-subtle divide-y divide-border mb-6">
        <div className="flex items-center gap-3 px-4 py-3 text-sm"><Mail size={15} className="text-text-tertiary shrink-0" /><span className="text-text-tertiary w-20 shrink-0">Email</span><span className="text-text-primary truncate">{state.email}</span></div>
        <div className="flex items-center gap-3 px-4 py-3 text-sm"><Building2 size={15} className="text-text-tertiary shrink-0" /><span className="text-text-tertiary w-20 shrink-0">Organization</span><span className="text-text-primary truncate">{state.organization}</span></div>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <FormAlert>{error}</FormAlert>}
        <div>
          <PasswordField label="Password" name="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={pwError}
            hint={pwError ? undefined : `At least ${PASSWORD_MIN_LENGTH} characters. A passphrase works well.`} />
          <PasswordMeter value={password} min={PASSWORD_MIN_LENGTH} />
        </div>
        <SubmitButton busy={busy}>Create account</SubmitButton>
      </form>
      <p className="mt-5 text-xs text-text-tertiary leading-relaxed">Creating your account makes you the administrator of <span className="text-text-secondary">{state.organization}</span>. You can invite your team afterwards.</p>
    </AuthShell>
  );
}
