import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { BrowserSessionStorage, MemoryStorage } from './storage';

// ─── Internal constants ────────────────────────────────────────────────────────
// Header name must match the NestJS package default (traceHeader: 'x-loki-trace-id').
const TRACE_HEADER = 'x-loki-trace-id';
const STORAGE_KEY  = '__pmld_loki_trace';

// ─── Internal storage ─────────────────────────────────────────────────────────
// Browser: sessionStorage — survives same-tab refresh, cleared on tab close.
// Everywhere else (SSR, Node scripts): in-memory — scoped to the JS context.
const traceStorage =
  typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
    ? new BrowserSessionStorage()
    : new MemoryStorage();

// ─── Internal helpers ─────────────────────────────────────────────────────────
function generateHexId(bytes: number): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Node.js fallback (SSR)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('crypto').randomBytes(bytes).toString('hex') as string;
}

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * IDs returned by `attachSessionInterceptor`.
 * Pass them to `axiosInstance.interceptors.*.eject(id)` to detach on logout
 * or test cleanup.
 */
export interface SessionInterceptorIds {
  /** ID of the request interceptor that injects `x-loki-trace-id`. */
  requestId: number;
  /** ID of the response interceptor that captures `x-loki-trace-id`. */
  responseId: number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Attaches trace-id propagation interceptors to the given Axios instance.
 *
 * **Request side** — reads the stored trace id and injects it as
 * `x-loki-trace-id` on every outgoing request so the backend can correlate
 * all calls within the same session.
 *
 * **Response side** — reads `x-loki-trace-id` from every response header and
 * writes it into storage so the backend-assigned id takes precedence over the
 * client-generated seed.
 *
 * **Seeding** — on setup a 32-char hex trace id is auto-generated and stored
 * *only if storage is empty*, so the very first request already carries an id
 * without waiting for a response.  A same-tab page refresh reuses the
 * existing id (no reset) because `sessionStorage` persists for the tab
 * lifetime.  A new tab or session starts fresh.
 *
 * Everything — header name, storage key, storage backend — is managed
 * internally.  No configuration is needed.
 *
 * @returns `{ requestId, responseId }` — Axios interceptor IDs for ejection.
 *
 * @example
 * // main.ts / api.ts — one line, no options
 * attachSessionInterceptor(axiosInstance);
 */
export function attachSessionInterceptor(
  axiosInstance: AxiosInstance,
): SessionInterceptorIds {
  // Seed storage so the first outgoing request already has a trace id.
  // Only writes if nothing is stored yet — preserves the id across same-tab refreshes.
  void (async () => {
    try {
      const existing = await traceStorage.getItem(STORAGE_KEY);
      if (!existing) {
        await traceStorage.setItem(STORAGE_KEY, generateHexId(16));
      }
    } catch {
      // Storage errors must never crash the app
    }
  })();

  const requestId = axiosInstance.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      try {
        const traceId = await traceStorage.getItem(STORAGE_KEY);
        if (traceId) {
          config.headers[TRACE_HEADER] = traceId;
        }
      } catch {
        // Silently skip — never block the request
      }
      return config;
    },
    (error) => Promise.reject(error),
  );

  const responseId = axiosInstance.interceptors.response.use(
    async (response: AxiosResponse) => {
      const traceId = response.headers?.[TRACE_HEADER];
      if (traceId && typeof traceId === 'string') {
        try {
          await traceStorage.setItem(STORAGE_KEY, traceId);
        } catch {
          // Silently skip — never crash on storage write
        }
      }
      return response;
    },
    (error) => Promise.reject(error),
  );

  return { requestId, responseId };
}
