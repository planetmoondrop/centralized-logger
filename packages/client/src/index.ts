import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { SessionInterceptorOptions, SessionStorage } from './types';
import { MemoryStorage, BrowserSessionStorage, BrowserLocalStorage } from './storage';

export { MemoryStorage, BrowserSessionStorage, BrowserLocalStorage };
export type { SessionInterceptorOptions, SessionStorage };

/**
 * IDs returned by `attachSessionInterceptor`, one per Axios interceptor slot.
 * Pass them to `axiosInstance.interceptors.request.eject(requestId)` /
 * `axiosInstance.interceptors.response.eject(responseId)` to detach.
 */
export interface SessionInterceptorIds {
  /** ID of the request interceptor that injects the trace header. */
  requestId: number;
  /** ID of the response interceptor that captures the trace header. */
  responseId: number;
}

/**
 * Attaches request + response interceptors to the given Axios instance so that:
 *
 * - **Every response**: if the server returns `responseHeader`, the value is
 *   written into `storage` under `storageKey`.
 * - **Every request**: if `storage` contains a value for `storageKey`, it is
 *   added to the request under `requestHeader`.
 *
 * Because MemoryStorage is cleared on page refresh, pass a `BrowserSessionStorage`
 * or `BrowserLocalStorage` for production use so the trace context survives
 * in-app navigations and full reloads.
 *
 * If `initialSessionId` is supplied (or auto-generated via `generateInitialId`),
 * it is written to storage immediately so the **very first** outgoing request
 * already carries a trace ID instead of waiting for the first response.
 *
 * @param axiosInstance - The Axios instance to instrument.
 * @param options - Configuration options.
 * @returns `{ requestId, responseId }` — Axios interceptor IDs for ejection.
 */
export function attachSessionInterceptor(
  axiosInstance: AxiosInstance,
  options: SessionInterceptorOptions = {},
): SessionInterceptorIds {
  const {
    responseHeader = 'x-loki-trace-id',
    requestHeader = 'x-loki-trace-id',
    storageKey = 'lokiTraceId',
    storage = new MemoryStorage(),
    initialSessionId,
    generateInitialId = false,
  } = options;

  // Seed storage so the first outgoing request already has a trace ID.
  // IMPORTANT: only write if nothing is already stored — this ensures a page
  // refresh within the same tab continues the same trace rather than resetting it.
  // Priority: explicitly passed ID > auto-generated > nothing
  void (async () => {
    try {
      const existing = await storage.getItem(storageKey);
      if (!existing) {
        if (initialSessionId) {
          await storage.setItem(storageKey, initialSessionId);
        } else if (generateInitialId) {
          await storage.setItem(storageKey, generateHexId(32));
        }
      }
    } catch {
      /* Silently ignore — storage errors must never break the app */
    }
  })();

  // Request interceptor: inject stored trace ID into outgoing headers
  const requestId = axiosInstance.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      try {
        const traceId = await storage.getItem(storageKey);
        if (traceId) {
          config.headers[requestHeader] = traceId;
        }
      } catch (err) {
        console.warn('[moondrop-logger-client] Failed to read trace ID:', err);
      }
      return config;
    },
    (error) => Promise.reject(error),
  );

  // Response interceptor: capture trace ID from response headers
  const responseId = axiosInstance.interceptors.response.use(
    async (response: AxiosResponse) => {
      const traceId = response.headers?.[responseHeader.toLowerCase()];
      if (traceId && typeof traceId === 'string') {
        try {
          await storage.setItem(storageKey, traceId);
        } catch (err) {
          console.warn('[moondrop-logger-client] Failed to save trace ID:', err);
        }
      }
      return response;
    },
    async (error) => {
      // Still attempt to capture the trace ID from error responses (4xx / 5xx)
      const traceId = error?.response?.headers?.[responseHeader.toLowerCase()];
      if (traceId && typeof traceId === 'string') {
        try {
          await storage.setItem(storageKey, traceId);
        } catch {
          /* ignore */
        }
      }
      return Promise.reject(error);
    },
  );

  return { requestId, responseId };
}

/** Generates a random lowercase hex string of the requested character length. */
function generateHexId(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Node.js fallback (for SSR edge cases / tests)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}
