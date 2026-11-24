"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MailCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { CheckboxField, Divider, FormAlert, SelectField, SubmitButton, TextField } from "@/components/auth/fields";
import { ProviderButtons } from "@/components/auth/ProviderButtons";
import { ApiError, authApi, type ProvidersResponse } from "@/lib/auth/client";
import { countries } from "@/lib/auth/countries";

const LICENSE_HREF = "/legal/community-license";
const RESEND_AFTER_S = 30;

type Fields = "fullName" | "email" | "organization" | "country" | "license";

export function SignupView() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [country, setCountry] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [cfg, setCfg] = useState<ProvidersResponse | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const list = useMemo(() => countries(), []);
  const firstBad = useRef<Fields | null>(null);
  /** An error goes away as soon as the person changes the field it is about. */
  const clear = (k: Fields) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));

  useEffect(() => { authApi.providers().then(setCfg).catch(() => setCfg(null)); }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /** Checks the form and returns what the server needs, or null after showing what is missing. Shared by the email button and the provider buttons. */
  const collect = (needEmail: boolean) => {
    const e: Partial<Record<Fields, string>> = {};
    if (!fullName.trim()) e.fullName = "Enter your name.";
    if (needEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "Enter a valid work email.";
    if (organization.trim().length < 2) e.organization = "Enter your company or team name.";
    if (!country) e.country = "Choose your country.";
    if (!agreed) e.license = "You need to agree to the license to continue.";
    setErrors(e);
    const order: Fields[] = ["fullName", "email", "organization", "country", "license"];
    firstBad.current = order.find((k) => e[k]) ?? null;
    if (firstBad.current) {
      document.getElementById(`su-${firstBad.current}`)?.focus();
      return null;
    }
    return true;
  };

  const licenseVersion = async () => cfg?.licenseVersion ?? (await authApi.providers()).licenseVersion;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!collect(true)) return;
    setBusy(true);
    try {
      await authApi.signup({ fullName: fullName.trim(), email: email.trim(), organization: organization.trim(), country, licenseVersion: await licenseVersion() });
      setSent(true); setCooldown(RESEND_AFTER_S);
    } catch (err) {
      if (err instanceof ApiError && err.code === "license_changed") {
        setAgreed(false); setCfg(null); authApi.providers().then(setCfg).catch(() => undefined);
        setError("The license agreement was updated while you were filling this in. Read it and agree again to continue.");
      } else {
        setError(err instanceof ApiError ? (err.status === 429 ? "Too many attempts. Try again in a few minutes." : err.message) : "Something went wrong. Try again.");
      }
    } finally { setBusy(false); }
  };

  const prepare = () => {
    setError(null);
    if (!collect(false)) return null;
    if (!cfg) { setError("Could not reach tok\u2211ner. Check your connection and try again."); return null; }
    return cfg ? { organization: organization.trim(), country, licenseVersion: cfg.licenseVersion } : null;
  };

  const resend = async () => {
    setResendNote(null);
    try { await authApi.resendVerification(email.trim()); } catch { /* the answer is the same either way */ }
    setResendNote("Sent again."); setCooldown(RESEND_AFTER_S);
  };

  if (sent) {
    return (
      <AuthShell title="Check your email" subtitle="One more step to finish creating your account.">
        <div className="rounded-lg border border-border bg-surface-subtle px-5 py-5 flex gap-4">
          <span className="h-10 w-10 shrink-0 rounded-full bg-accent-500/15 text-accent-700 grid place-items-center"><MailCheck size={20} /></span>
          <div className="min-w-0">
            <p className="text-sm text-text-secondary leading-relaxed">We sent a link to <strong className="text-text-primary break-all">{email.trim()}</strong>.</p>
            <p className="text-sm text-text-secondary leading-relaxed mt-2">Open it to confirm your address and choose your password. The link works once and expires in 24 hours.</p>
          </div>
        </div>
        <ol className="mt-6 flex flex-col gap-2.5 text-[13px] text-text-secondary">
          <li className="flex gap-2.5"><span className="mt-px h-5 w-5 rounded-full bg-ink-800 text-accent-500 grid place-items-center text-[10px] shrink-0">1</span>Open the email from tok&sum;ner. Check spam if it is not in your inbox.</li>
          <li className="flex gap-2.5"><span className="mt-px h-5 w-5 rounded-full bg-ink-800 text-accent-500 grid place-items-center text-[10px] shrink-0">2</span>Choose a password. Your organization is created when you do.</li>
        </ol>
        <div className="mt-7 pt-6 border-t border-border flex flex-wrap items-center justify-between gap-3 text-sm">
          <button type="button" onClick={() => { setSent(false); setResendNote(null); }} className="inline-flex items-center gap-1.5 text-text-secondary hover:text-text-primary"><ArrowLeft size={14} /> Use a different email</button>
          <button type="button" disabled={cooldown > 0} onClick={resend} className="font-medium text-ink-800 hover:text-accent-700 disabled:text-text-tertiary disabled:no-underline underline underline-offset-4">
            {cooldown > 0 ? `Send again in ${cooldown}s` : "Send the link again"}
          </button>
        </div>
        {resendNote && <p role="status" className="mt-3 text-xs text-text-tertiary">{resendNote}</p>}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start free with usage credit and try any feature. A card is asked for only when you save or launch something metered."
      footer={
        <>
          <p>Already have an account? <Link href="/login" className="font-medium text-ink-800 hover:text-accent-700 underline underline-offset-4">Sign in</Link></p>
          <p className="mt-3 text-xs text-text-tertiary">Joining your team&rsquo;s organization? <Link href="/request-access" className="underline underline-offset-4 hover:text-text-secondary">Request access</Link></p>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && <FormAlert>{error}</FormAlert>}
        <TextField id="su-fullName" label="Full name" name="name" autoComplete="name" value={fullName} error={errors.fullName} onChange={(e) => { setFullName(e.target.value); clear("fullName"); }} />
        <TextField id="su-email" label="Work email" type="email" name="email" autoComplete="email" placeholder="you@company.com" value={email} error={errors.email}
          hint="We will email a link to this address to continue." onChange={(e) => { setEmail(e.target.value); clear("email"); }} />
        <TextField id="su-organization" label="Company or team" name="organization" autoComplete="organization" value={organization} error={errors.organization} onChange={(e) => { setOrganization(e.target.value); clear("organization"); }} />
        <SelectField id="su-country" label="Country" name="country" autoComplete="country" value={country} error={errors.country} onChange={(e) => { setCountry(e.target.value); clear("country"); }}>
          <option value="">Select your country</option>
          {list.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </SelectField>
        <CheckboxField id="su-license" checked={agreed} onChange={(v) => { setAgreed(v); clear("license"); }} error={errors.license}>
          I agree to the terms of the{" "}
          <Link href={LICENSE_HREF} target="_blank" rel="noopener noreferrer" className="font-medium text-text-primary underline underline-offset-2 hover:text-accent-700">tok&sum;ner Community License Agreement</Link>.
        </CheckboxField>
        <SubmitButton busy={busy}>Continue</SubmitButton>
      </form>

      <Divider>or sign up with</Divider>
      <ProviderButtons intent="signup" config={cfg} prepare={prepare} />
      <p className="mt-6 text-xs text-text-tertiary leading-relaxed">
        We use these details to create your account and send you the link. See the <Link href="/legal/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
      </p>
    </AuthShell>
  );
}
