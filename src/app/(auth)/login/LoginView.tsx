"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DemoLink } from "@/components/auth/DemoLink";
import { Divider, FormAlert, PasswordField, SubmitButton, TextField } from "@/components/auth/fields";
import { ProviderButtons } from "@/components/auth/ProviderButtons";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ApiError, authApi } from "@/lib/auth/client";
import { safeNext } from "@/lib/auth/next";

export function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { status, adopt } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => { if (status === "session") router.replace(next); }, [status, next, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setUnverified(false); setBusy(true);
    try {
      adopt(await authApi.login(email.trim(), password, keep));
      router.replace(next);
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError) {
        if (err.code === "email_not_verified") { setUnverified(true); setError("Verify your email address to sign in. We sent you a link when you signed up."); }
        else if (err.status === 429) setError(`Too many attempts. Try again${err.retryAfter ? ` in ${Math.ceil(err.retryAfter / 60)} minute${err.retryAfter > 90 ? "s" : ""}` : " in a few minutes"}.`);
        else if (err.status === 401) setError("The email or password is not right.");
        else setError(err.message);
      } else setError("Something went wrong. Try again.");
    }
  };

  const resend = async () => {
    try { await authApi.resendVerification(email.trim()); } catch { /* the answer is the same either way */ }
    setResent(true);
  };

  return (
    <div>
      <h1 className="text-[1.9rem] leading-tight font-semibold tracking-tight text-text-primary">Sign in</h1>
      <p className="text-text-secondary text-sm mt-1.5 mb-7">Access your organization&rsquo;s AI control plane.</p>
      <ProviderButtons intent="signin" next={next} />
      <Divider>or</Divider>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <FormAlert>{error}{unverified && (resent ? " Sent again." : <> <button type="button" onClick={resend} className="underline underline-offset-2">Send it again</button>.</>)}</FormAlert>}
        <TextField label="Email" type="email" name="email" autoComplete="username" placeholder="you@company.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField label="Password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="flex items-center justify-between -mt-1">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="h-4 w-4 rounded border-border-strong text-accent-600 focus:ring-accent-500" />
            Keep me signed in
          </label>
          <Link href="/reset-password" className="text-sm text-ink-700 hover:text-accent-700 font-medium">Forgot password?</Link>
        </div>
        <SubmitButton busy={busy}>Sign in</SubmitButton>
      </form>
      <p className="text-center text-sm text-text-secondary mt-8">
        New to tok&sum;ner? <Link href="/signup" className="font-medium text-ink-800 hover:text-accent-700 underline underline-offset-4">Sign up</Link>
      </p>
      <div className="mt-6 pt-6 border-t border-border text-center">
        <DemoLink className="text-sm text-text-tertiary hover:text-text-secondary underline underline-offset-4 decoration-border-strong" />
      </div>
    </div>
  );
}
