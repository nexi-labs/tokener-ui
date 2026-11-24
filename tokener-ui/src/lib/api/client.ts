/**
 * The console's client for the control plane API. Every call carries the signed-in person's access token, errors arrive as ApiError with a
 * stable code, and a 401 asks the auth provider to refresh once before giving up. Same-origin by default: next.config.mjs proxies /api to the
 * control plane. Nothing here is used in the sample workspace, which never calls the API.
 */
import { API_BASE, ApiError } from "@/lib/auth/client";

export { ApiError };

type Bridge = {
  /** A valid access token, refreshed when it is about to expire. Null when nobody is signed in. */
  getToken: () => Promise<string | null>;
  /** Called when the API refuses the token even after a refresh, so the person is sent to sign in. */
  onUnauthorized: () => void;
};

let bridge: Bridge | null = null;
export function registerAuthBridge(b: Bridge | null) { bridge = b; }

export type Query = Record<string, string | number | boolean | undefined | null>;
export type CallOptions = { query?: Query; signal?: AbortSignal; headers?: Record<string, string>; raw?: boolean };

function qs(q?: Query): string {
  if (!q) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function send(method: string, path: string, body: unknown, opts: CallOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  const binary = typeof Blob !== "undefined" && (body instanceof Blob || body instanceof ArrayBuffer);
  if (body !== undefined && !binary && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    return await fetch(`${API_BASE}${path}${qs(opts.query)}`, {
      method, headers, signal: opts.signal, cache: "no-store",
      body: body === undefined ? undefined : binary ? (body as Blob | ArrayBuffer) : JSON.stringify(body),
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ApiError(0, "network_error", "Could not reach tok∑ner. Check your connection and try again.");
  }
}

export async function call<T = unknown>(method: string, path: string, body?: unknown, opts: CallOptions = {}): Promise<T> {
  let token = bridge ? await bridge.getToken() : null;
  let res = await send(method, path, body, opts, token);
  if (res.status === 401 && bridge) {
    token = await bridge.getToken();
    if (token) res = await send(method, path, body, opts, token);
    if (res.status === 401) { bridge.onUnauthorized(); }
  }
  if (res.status === 204) return undefined as T;
  if (opts.raw) {
    if (!res.ok) throw await problem(res);
    return res as unknown as T;
  }
  const text = await res.text();
  let data: unknown = undefined;
  if (text) { try { data = JSON.parse(text); } catch { /* not JSON */ } }
  if (!res.ok) throw problemFrom(res, data);
  return data as T;
}

async function problem(res: Response): Promise<ApiError> {
  const text = await res.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : undefined; } catch { /* not JSON */ }
  return problemFrom(res, data);
}

function problemFrom(res: Response, data: unknown): ApiError {
  const d = (data ?? {}) as { code?: string; detail?: string; title?: string; requestId?: string; fields?: Record<string, string> };
  const retry = Number(res.headers.get("Retry-After"));
  return new ApiError(
    res.status,
    d.code ?? (res.status === 404 ? "not_found" : res.status === 403 ? "forbidden" : "request_failed"),
    d.detail ?? (res.status >= 500 ? "Something went wrong on our side. Try again in a moment." : res.status === 403 ? "You do not have permission to do that." : "The request was not accepted."),
    d.requestId,
    Number.isFinite(retry) && retry > 0 ? retry : undefined,
    d.fields && typeof d.fields === "object" ? d.fields : undefined,
  );
}

export const http = {
  get: <T>(path: string, query?: Query, opts: CallOptions = {}) => call<T>("GET", path, undefined, { ...opts, query }),
  post: <T>(path: string, body?: unknown, opts?: CallOptions) => call<T>("POST", path, body ?? {}, opts),
  put: <T>(path: string, body?: unknown, opts?: CallOptions) => call<T>("PUT", path, body ?? {}, opts),
  patch: <T>(path: string, body?: unknown, opts?: CallOptions) => call<T>("PATCH", path, body ?? {}, opts),
  delete: <T = void>(path: string, opts?: CallOptions) => call<T>("DELETE", path, undefined, opts),
};

/** Paged responses from the platform modules: { content, page, size, totalElements, totalPages }. */
export type Paged<T> = { content: T[]; page: number; size: number; totalElements: number; totalPages: number };
