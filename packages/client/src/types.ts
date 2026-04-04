/**
 * Storage interface for saving/loading the trace session ID.
 * Both synchronous and async implementations are accepted.
 */
export interface SessionStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
}

/**
 * Options for `attachSessionInterceptor`.
 */
export interface SessionInterceptorOptions {
  /**
   * Name of the response header to read the trace ID from.
   * @default 'x-loki-trace-id'
   */
  responseHeader?: string;

  /**
   * Name of the request header to send the trace ID in.
   * @default 'x-loki-trace-id'
   */
  requestHeader?: string;

  /**
   * Key used to store the trace ID in the storage backend.
   * @default 'lokiTraceId'
   */
  storageKey?: string;

  /**
   * Storage backend.
   * - `MemoryStorage` (default): ephemeral, cleared on page refresh.
   * - `BrowserSessionStorage`: survives in-app navigation and reloads within the same tab.
   * - `BrowserLocalStorage`: persists across tabs and full page refreshes.
   */
  storage?: SessionStorage;

  /**
   * An explicit session / trace ID to seed into storage immediately on setup.
   * This ensures the **first outgoing request** already carries a trace ID.
   * Takes precedence over `generateInitialId`.
   */
  initialSessionId?: string;

  /**
   * When `true`, a random 32-char hex trace ID is auto-generated and seeded
   * into storage on setup so the first request is already correlated.
   * Ignored if `initialSessionId` is provided.
   * @default false
   */
  generateInitialId?: boolean;
}
