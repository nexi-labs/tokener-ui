"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { authApi, type AuthUser, type Session } from "./client";
import { registerAuthBridge } from "@/lib/api/client";

/**
 * anonymous: nobody is signed in. session: a person is signed in. demo: the sample workspace, which uses local sample data and never calls the
 * API. loading: the first refresh is still in flight, so the console must not redirect yet.
 */
export type AuthStatus = "loading" | "anonymous" | "session" | "demo";

type Ctx = {
  status: AuthStatus;
  user: AuthUser | null;
  /** A valid access token, refreshed first when it is about to expire. Null when not signed in. */
  getAccessToken: () => Promise<string | null>;
  /** Adopt a session returned by login, signup verification, an invitation or an SSO callback. */
  adopt: (s: Session) => void;
  signOut: () => Promise<void>;
  enterDemo: () => void;
  /** The organization the console is working in, or null for the sample workspace and for platform operators who have not picked one. */
  orgId: string | null;
  /** True when the person holds a platform role, so the platform administration screens apply. */
  isPlatform: boolean;
};

const AuthContext = createContext<Ctx | null>(null);
const DEMO_KEY = "tok.demo";
const LEEWAY_MS = 45_000;

function demoFlag(): boolean {
  try { return sessionStorage.getItem(DEMO_KEY) === "1"; } catch { return false; }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const token = useRef<{ value: string; expiresAt: number } | null>(null);
  const inflight = useRef<Promise<Session | null> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const adopt = useCallback((s: Session) => {
    token.current = { value: s.accessToken, expiresAt: Date.now() + s.expiresIn * 1000 };
    try { sessionStorage.removeItem(DEMO_KEY); } catch { /* storage unavailable */ }
    setUser(s.user);
    setStatus("session");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void refresh(); }, Math.max(5_000, s.expiresIn * 1000 - LEEWAY_MS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clear = useCallback(() => {
    token.current = null;
    if (timer.current) clearTimeout(timer.current);
    setUser(null);
    setStatus(demoFlag() ? "demo" : "anonymous");
  }, []);

  // One refresh at a time: the server rotates the refresh token, so two parallel calls would make the second look like token reuse.
  const refresh = useCallback((): Promise<Session | null> => {
    if (inflight.current) return inflight.current;
    inflight.current = authApi.refresh()
      .then((s) => { adopt(s); return s; })
      .catch(() => { clear(); return null; })
      .finally(() => { inflight.current = null; });
    return inflight.current;
  }, [adopt, clear]);

  useEffect(() => {
    if (demoFlag()) { setStatus("demo"); return; }
    void refresh();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [refresh]);

  const getAccessToken = useCallback(async () => {
    const t = token.current;
    if (t && t.expiresAt - Date.now() > LEEWAY_MS) return t.value;
    const s = await refresh();
    return s ? s.accessToken : null;
  }, [refresh]);

  const signOut = useCallback(async () => {
    try { sessionStorage.removeItem(DEMO_KEY); } catch { /* storage unavailable */ }
    try { await authApi.logout(); } catch { /* the cookie is cleared server side when reachable; local state is cleared either way */ }
    token.current = null;
    if (timer.current) clearTimeout(timer.current);
    setUser(null);
    setStatus("anonymous");
  }, []);

  const enterDemo = useCallback(() => {
    try { sessionStorage.setItem(DEMO_KEY, "1"); } catch { /* storage unavailable */ }
    setStatus("demo");
  }, []);

  // The API client asks this provider for tokens, so there is exactly one refresh in flight no matter how many screens call at once.
  useEffect(() => {
    registerAuthBridge({
      getToken: getAccessToken,
      onUnauthorized: () => { clear(); },
    });
    return () => registerAuthBridge(null);
  }, [getAccessToken, clear]);

  const orgId = useMemo(() => {
    if (!user) return null;
    const direct = user.assignments.find((a) => a.scope.type === "org" && a.scope.id);
    return user.organizations?.[0]?.id ?? direct?.scope.id ?? null;
  }, [user]);
  const isPlatform = useMemo(() => !!user?.assignments.some((a) => a.scope.type === "platform"), [user]);

  const value = useMemo<Ctx>(() => ({ status, user, getAccessToken, adopt, signOut, enterDemo, orgId, isPlatform }), [status, user, getAccessToken, adopt, signOut, enterDemo, orgId, isPlatform]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Ctx {
  const c = useContext(AuthContext);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
