"use client";

import { DEMO_USER } from "@/lib/auth/demoUser";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, CreditCard, KeyRound, LogOut } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Notice, Tabs, Toaster } from "@/components/mlops/ui";
import { PasswordMeter } from "@/components/auth/fields";
import { toast } from "@/lib/mlops/toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ApiError, PASSWORD_MIN_LENGTH, authApi, passwordProblem } from "@/lib/auth/client";
import { roleLabel, scopeLabel } from "@/lib/iam/admin";
import { useBilling } from "@/lib/billing/useBilling";
import { creditLeft, daysLeft, describeMethod, usd } from "@/lib/billing/model";

type Tab = "profile" | "security" | "organization";

/** Account settings, the way cloud platforms lay them out: who you are, how you sign in, and the organization you work in. */
export default function AccountPage() {
  const [tab, setTab] = useState<Tab>("profile");
  return (
    <div className="space-y-5">
      <Toaster />
      <PageHeader title="Account settings" description="Your profile, how you sign in, and the organization you work in." />
      <Tabs<Tab> label="Account sections" value={tab} onChange={setTab} tabs={[{ id: "profile", label: "Profile" }, { id: "security", label: "Security" }, { id: "organization", label: "Organization" }]} />
      {tab === "profile" && <Profile />}
      {tab === "security" && <Security />}
      {tab === "organization" && <Organization />}
    </div>
  );
}

function useMe() {
  const { status, user } = useAuth();
  const demo = status === "demo";
  return {
    demo,
    user,
    name: demo ? DEMO_USER.name : user?.displayName ?? "",
    email: demo ? DEMO_USER.email : user?.email ?? "",
    provider: demo ? null : user?.externalProvider ?? null,
    created: demo ? "2026-03-14T09:00:00Z" : user?.createdAt ?? null,
    lastLogin: demo ? "2026-10-30T07:12:00Z" : user?.lastLoginAt ?? null,
  };
}
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never");

function Profile() {
  const me = useMe();
  const { getAccessToken } = useAuth();
  const [name, setName] = useState(me.name);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (me.demo) { toast("Saved in the sample workspace only", "info"); return; }
    setBusy(true);
    try {
      const t = await getAccessToken();
      if (!t) throw new ApiError(401, "unauthenticated", "Sign in again to continue.");
      await authApi.updateProfile(t, { displayName: name.trim() });
      toast("Profile updated");
    } catch (e) { toast(e instanceof ApiError ? e.message : "Could not save", "error"); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card className="lg:col-span-2">
        <CardHeader title="Profile" subtitle="Shown to your teammates and in the audit trail" />
        <CardBody className="space-y-4 max-w-md">
          <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
          <Field label="Email" hint="Your email is how you sign in. To change it, contact your organization admin."><Input value={me.email} readOnly disabled /></Field>
          <Button variant="primary" onClick={save} disabled={busy || !name.trim() || name.trim() === me.name}>{busy ? "Saving..." : "Save changes"}</Button>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Sign-in" />
        <CardBody className="space-y-3 text-sm">
          <div className="flex justify-between gap-3"><span className="text-text-tertiary">Method</span><span className="text-text-primary [&:first-letter]:uppercase">{me.provider ?? "Email and password"}</span></div>
          <div className="flex justify-between gap-3"><span className="text-text-tertiary">Last sign-in</span><span className="text-text-primary">{when(me.lastLogin)}</span></div>
          <div className="flex justify-between gap-3"><span className="text-text-tertiary">Member since</span><span className="text-text-primary">{when(me.created)}</span></div>
        </CardBody>
      </Card>
    </div>
  );
}

function Security() {
  const me = useMe();
  const { getAccessToken, signOut } = useAuth();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = next ? passwordProblem(next) : null;

  const change = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (passwordProblem(next)) return;
    setBusy(true);
    try {
      const t = await getAccessToken();
      if (!t) throw new ApiError(401, "unauthenticated", "Sign in again to continue.");
      await authApi.changePassword(t, current, next);
      setCurrent(""); setNext(""); toast("Password changed. Other devices are signed out.");
    } catch (err) { setError(err instanceof ApiError ? (err.status === 401 || err.status === 422 ? err.message : err.message) : "Something went wrong. Try again."); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card className="lg:col-span-2">
        <CardHeader title="Password" subtitle={me.provider ? `You sign in with ${me.provider}, so there is no password to change` : "Choose a long passphrase you do not use elsewhere"} />
        <CardBody>
          {me.demo ? <Notice tone="info" title="Sample workspace">Passwords are not used in the sample workspace.</Notice> : me.provider ? (
            <p className="text-sm text-text-secondary">Your {me.provider} account controls how you sign in. Change its password or two-step settings there.</p>
          ) : (
            <form onSubmit={change} className="space-y-4 max-w-md" noValidate>
              {error && <Notice tone="bad">{error}</Notice>}
              <Field label="Current password"><Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
              <Field label="New password" hint={problem ?? `At least ${PASSWORD_MIN_LENGTH} characters.`}><Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
              <PasswordMeter value={next} min={PASSWORD_MIN_LENGTH} />
              <Button type="submit" variant="primary" disabled={busy || !current || !next || !!problem}>{busy ? "Changing..." : "Change password"}</Button>
            </form>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="This session" />
        <CardBody className="space-y-3">
          <p className="text-sm text-text-secondary">Signed in as <span className="text-text-primary">{me.email}</span>.</p>
          <Button variant="secondary" onClick={async () => { await signOut(); router.replace("/login"); }}><LogOut size={15} /> {me.demo ? "Leave the demo" : "Sign out"}</Button>
          <div className="pt-3 border-t border-border">
            <Link href="/api-keys" className="text-sm text-text-primary font-medium inline-flex items-center gap-2 hover:text-accent-700"><KeyRound size={15} /> Manage API keys</Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function Organization() {
  const { status, user, orgId } = useAuth();
  const b = useBilling();
  const demo = status === "demo";
  const org = demo ? { id: "00000000-0000-4000-8000-0000000000a1", name: "NexI Corp" } : user?.organizations?.find((o) => o.id === orgId) ?? user?.organizations?.[0];
  const roles = demo ? [{ role: "org_admin", scope: { type: "org", id: "x" } }] : user?.assignments ?? [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card className="lg:col-span-2">
        <CardHeader title="Organization" subtitle="The workspace your teams, budgets and pipelines belong to" />
        <CardBody className="space-y-4">
          {!org ? <Notice tone="info" title="No organization">This account is not part of an organization. Platform operators work across organizations from Platform Administration.</Notice> : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                <Field label="Name"><Input value={org.name} readOnly disabled /></Field>
                <Field label="Organization ID" hint="Use this when you contact support.">
                  <div className="flex gap-2"><Input value={org.id} readOnly className="font-mono text-xs" /><Button variant="secondary" aria-label="Copy organization ID" onClick={() => { void navigator.clipboard?.writeText(org.id); toast("Copied", "info"); }}><Copy size={14} /></Button></div>
                </Field>
              </div>
              <div>
                <h3 className="text-[13px] font-medium text-text-primary mb-2">Your access</h3>
                <div className="flex flex-wrap gap-2">{roles.map((r, i) => <Badge key={i} tone="info">{roleLabel(r.role)} · {scopeLabel(r, org.name)}</Badge>)}</div>
              </div>
            </>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Plan and billing" />
        <CardBody className="space-y-3 text-sm">
          {b.status === "ready" ? (
            <>
              <div className="flex justify-between gap-3"><span className="text-text-tertiary">Plan</span><span className="text-text-primary">{b.account.paymentMethod ? "Pay as you go" : "Free start"}</span></div>
              {!b.account.paymentMethod && <div className="flex justify-between gap-3"><span className="text-text-tertiary">Credit left</span><span className="text-text-primary tabular-nums">{usd(creditLeft(b.account))} · {daysLeft(b.account)} days</span></div>}
              <div className="flex justify-between gap-3"><span className="text-text-tertiary">Payment method</span><span className="text-text-primary">{b.account.paymentMethod ? describeMethod(b.account.paymentMethod).title : "None"}</span></div>
            </>
          ) : <p className="text-text-secondary">Billing details are not available right now.</p>}
          <Link href="/billing" className="inline-flex items-center gap-2 text-sm font-medium text-text-primary hover:text-accent-700 pt-1"><CreditCard size={15} /> Billing and payment</Link>
        </CardBody>
      </Card>
    </div>
  );
}
