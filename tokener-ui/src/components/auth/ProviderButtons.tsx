"use client";

import { useEffect, useState } from "react";
import { siGithub } from "simple-icons";
import { GoogleG } from "@/components/icons/GoogleG";
import { SimpleIcon } from "@/components/icons/SimpleIcon";
import { authApi, ApiError, type ProvidersResponse } from "@/lib/auth/client";
import { rememberNext } from "@/lib/auth/next";
import { FormAlert } from "./fields";

const ICONS = { google: null, github: siGithub } as const;
const LABELS = { google: "Google", github: "GitHub" } as const;
type Id = keyof typeof ICONS;

/**
 * Continue with Google or GitHub. The browser is sent to the provider and returns to /auth/callback, which completes the sign-in with the
 * server. A provider the operator has not configured is shown disabled rather than hidden, so the page does not change shape between installs.
 */
export function ProviderButtons({ intent, organization, next, prepare, config }: {
  intent: "signin" | "signup"; organization?: string; next?: string;
  /**
   * For a sign up: called when a provider button is pressed. It returns what the form collected (country and the accepted license version),
   * or null when the form is not complete, in which case the form shows what is missing and nobody leaves for the provider.
   */
  prepare?: () => { organization: string; country: string; licenseVersion: string } | null;
  /** The providers response when the page already has it, so it is fetched once. */
  config?: ProvidersResponse | null;
}) {
  const [own, setOwn] = useState<ProvidersResponse | null>(null);
  const cfg = config !== undefined ? config : own;
  const [busy, setBusy] = useState<Id | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (config === undefined) authApi.providers().then(setOwn).catch(() => setOwn(null)); }, [config]);

  const go = async (id: Id) => {
    setError(null); setBusy(id);
    try {
      if (next) rememberNext(next);
      let terms: { organization: string; country: string; licenseVersion: string } | null = null;
      if (intent === "signup") {
        terms = prepare ? prepare() : null;
        if (!terms) { setBusy(null); return; }
      }
      const r = await authApi.ssoStart({
        provider: id, intent, organization: (terms?.organization ?? organization)?.trim() || undefined, country: terms?.country, licenseVersion: terms?.licenseVersion,
        redirectUri: `${window.location.origin}/auth/callback`,
      });
      window.location.assign(r.authorizationUrl);
    } catch (e) {
      setBusy(null);
      setError(e instanceof ApiError ? e.message : "Could not start sign-in. Try again.");
    }
  };

  const verb = intent === "signup" ? "Sign up with" : "Continue with";
  return (
    <div>
      <div className="flex flex-col gap-2.5">
        {(Object.keys(ICONS) as Id[]).map((id) => {
          const offline = cfg !== null && !cfg.providers.some((p) => p.id === id);
          return (
            <button key={id} type="button" onClick={() => go(id)} disabled={busy !== null || offline} title={offline ? `${LABELS[id]} sign-in is not configured on this installation` : undefined}
              className="w-full h-11 rounded-md border border-border-strong bg-surface hover:bg-surface-subtle disabled:opacity-50 disabled:hover:bg-surface transition-colors flex items-center justify-center gap-2.5 text-sm font-medium text-text-primary">
              {id === "google" ? <GoogleG size={18} /> : <SimpleIcon icon={siGithub} size={18} />}
              {busy === id ? "Redirecting..." : `${verb} ${LABELS[id]}`}
            </button>
          );
        })}
      </div>
      {error && <div className="mt-3"><FormAlert>{error}</FormAlert></div>}
    </div>
  );
}
