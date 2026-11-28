"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { FormAlert } from "@/components/auth/fields";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ApiError, authApi } from "@/lib/auth/client";
import { takeNext } from "@/lib/auth/next";

/** Where Google, Microsoft and GitHub send the browser back. The code and state go to the server, which checks them and issues the session. */
export function CallbackView() {
  const params = useSearchParams();
  const router = useRouter();
  const { adopt } = useAuth();
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // the code works once, and strict mode runs effects twice in development
    started.current = true;
    const denied = params.get("error");
    const code = params.get("code");
    const state = params.get("state");
    if (denied) { setError({ message: denied === "access_denied" ? "Sign-in was cancelled." : "The provider did not complete the sign-in." }); return; }
    if (!code || !state) { setError({ message: "This page is only used when returning from a sign-in provider." }); return; }
    authApi.ssoComplete(code, state)
      .then((s) => { adopt(s); router.replace(takeNext()); })
      .catch((e) => setError(e instanceof ApiError ? { message: e.message, code: e.code } : { message: "Something went wrong. Try again." }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <AuthShell title="We could not sign you in" footer={<><Link href="/login" className="underline underline-offset-4">Sign in</Link> <span className="mx-1">&middot;</span> <Link href="/signup" className="underline underline-offset-4">Sign up</Link></>}>
        <FormAlert>{error.message}</FormAlert>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Signing you in">
      <div className="flex items-center justify-center gap-2.5 text-sm text-text-secondary py-4"><Loader2 size={16} className="animate-spin" /> One moment</div>
    </AuthShell>
  );
}
