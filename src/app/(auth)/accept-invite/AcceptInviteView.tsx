"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { FormAlert, PasswordField, SubmitButton, TextField } from "@/components/auth/fields";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ApiError, authApi, passwordProblem } from "@/lib/auth/client";

export function AcceptInviteView() {
  const token = useSearchParams().get("token");
  const router = useRouter();
  const { adopt } = useAuth();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return <AuthShell aside="invite" title="Invitation link incomplete"><FormAlert>This link is missing its token. Open the link from your invitation email again.</FormAlert></AuthShell>;
  }
  const pwError = touched ? passwordProblem(password) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setTouched(true); setError(null);
    if (passwordProblem(password)) return;
    setBusy(true);
    try {
      adopt(await authApi.acceptInvitation(token, password, fullName.trim() || undefined));
      router.replace("/dashboard");
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiError ? (err.code === "invalid_token" ? "This invitation has expired or was already used. Ask your administrator to send a new one." : err.message) : "Something went wrong. Try again.");
    }
  };

  return (
    <AuthShell aside="invite" title="Join your organization" subtitle="Choose a password to finish setting up your account." footer={<>Already set up? <Link href="/login" className="underline underline-offset-4">Sign in</Link></>}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <FormAlert>{error}</FormAlert>}
        <TextField label="Full name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} hint="Optional if your administrator already entered it." />
        <PasswordField label="Password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={pwError} hint="At least 12 characters." />
        <SubmitButton busy={busy}>Join and sign in</SubmitButton>
      </form>
    </AuthShell>
  );
}
