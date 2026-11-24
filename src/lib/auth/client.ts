/**
 * Typed client for the tok∑ner identity API (/api/v1/auth). The access token is a short-lived bearer token held in memory by the
 * AuthProvider. The refresh token never reaches JavaScript: the server keeps it in an HttpOnly cookie scoped to /api/v1/auth.
 *
 * Requests go to the same origin by default (next.config.mjs proxies /api to the control plane), so the cookie is first party and no CORS
 * is involved. Set NEXT_PUBLIC_API_BASE_URL to call the API directly instead; the server must then allow that origin with credentials.
 */

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");
const AUTH = `${API_BASE}/api/v1/auth`;

/** A refusal from the API, as RFC 9457 problem details. `code` is stable and safe to branch on; `message` is written for a person. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string, public retryAfter?: number, public fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
  }
}

export type RoleAssignment = { role: string; scope: { type: string; id?: string | null } };

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  status: "INVITED" | "ACTIVE" | "PENDING" | "DISABLED";
  assignments: RoleAssignment[];
  permissions: string[];
  passwordSet: boolean;
  /** Organizations this person can work in. Tenant-scoped roles are resolved to their organization by the server. Empty for platform operators with no organization. */
  organizations?: { id: string; name: string }[];
  externalProvider: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

export type SignupInput = { fullName: string; email: string; organization: string; country: string; licenseVersion: string };

export type Session = { accessToken: string; tokenType: "Bearer"; expiresIn: number; user: AuthUser };

export type ProviderInfo = { id: string; displayName: string };
export type ProvidersResponse = { providers: ProviderInfo[]; passwordEnabled: boolean; signupEnabled: boolean; licenseVersion: string };

async function call<T>(method: string, path: string, body?: unknown, opts: { token?: string | null } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", "X-Tokener-Client": "web" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let res: Response;
  try {
    res = await fetch(`${AUTH}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: "include", cache: "no-store" });
  } catch {
    throw new ApiError(0, "network_error", "Could not reach tok∑ner. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: any = undefined;
  if (text) { try { data = JSON.parse(text); } catch { /* not JSON */ } }
  if (!res.ok) {
    const retry = Number(res.headers.get("Retry-After"));
    throw new ApiError(
      res.status,
      data?.code ?? (res.status === 404 ? "not_found" : "request_failed"),
      data?.detail ?? (res.status >= 500 ? "Something went wrong on our side. Try again in a moment." : "The request was not accepted."),
      data?.requestId,
      Number.isFinite(retry) && retry > 0 ? retry : undefined,
    );
  }
  return data as T;
}

export const authApi = {
  providers: () => call<ProvidersResponse>("GET", "/providers"),

  login: (email: string, password: string, keepSignedIn: boolean) => call<Session>("POST", "/login", { email, password, keepSignedIn }),
  refresh: () => call<Session>("POST", "/refresh"),
  logout: () => call<void>("POST", "/logout"),
  me: (token: string) => call<AuthUser>("GET", "/me", undefined, { token }),
  /** Changes the name shown across the console. Email changes go through a verification link and are not offered here. */
  updateProfile: (token: string, input: { displayName: string }) => call<AuthUser>("PATCH", "/me", input, { token }),

  /**
   * Starts a sign up. There is no password here: the server emails a link, and the person chooses a password on the page it opens. `licenseVersion`
   * is the version the form showed (from providers()), sent with the tick so a changed license has to be accepted again.
   */
  signup: (input: SignupInput) => call<{ status: "verification_sent" }>("POST", "/signup", { ...input, acceptLicense: true }),
  /** Who a verification link is for. Reading it changes nothing; it fails with invalid_token for a link that is wrong, used or expired. */
  inspectVerification: (token: string) => call<{ email: string; fullName: string; organization: string }>("POST", "/verify-email/inspect", { token }),
  /** Opens the account with the password the person chose, and signs them in. */
  verifyEmail: (token: string, password: string) => call<Session>("POST", "/verify-email", { token, password }),
  resendVerification: (email: string) => call<void>("POST", "/resend-verification", { email }),

  forgotPassword: (email: string) => call<void>("POST", "/password/forgot", { email }),
  resetPassword: (token: string, password: string) => call<void>("POST", "/password/reset", { token, password }),
  changePassword: (token: string, currentPassword: string, newPassword: string) => call<Session>("POST", "/password/change", { currentPassword, newPassword }, { token }),
  acceptInvitation: (token: string, password: string, fullName?: string) => call<Session>("POST", "/invitations/accept", { token, password, fullName }),

  /** Returns where to send the browser. `redirectUri` must be the page that will call ssoComplete. */
  ssoStart: (input: { provider: string; intent: "signin" | "signup"; organization?: string; country?: string; licenseVersion?: string; redirectUri: string }) =>
    call<{ authorizationUrl: string }>("POST", "/sso/start", { ...input, acceptLicense: input.intent === "signup" ? true : undefined }),
  ssoComplete: (code: string, state: string) => call<Session>("POST", "/sso/complete", { code, state }),

  requestAccess: (input: { fullName: string; email: string; organization: string; reason: string }) => call<void>("POST", "/access-requests", input),
};

/** The same minimum the server enforces, so the form can say so before sending. The server remains the authority. */
export const PASSWORD_MIN_LENGTH = 12;
export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (pw.length > 128) return "Use at most 128 characters.";
  return null;
}
