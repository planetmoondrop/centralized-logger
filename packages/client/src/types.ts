/**
 * Storage interface for saving/loading the session ID.
 */
export interface SessionStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
}

/**
 * Options for the interceptor.
 */
export interface SessionInterceptorOptions {
  /**
   * Name of the response header to read the session ID from.
   * @default 'x-loki-trace-id'
   */
  responseHeader?: string;

  /**
   * Name of the request header to send the session ID in.
   * @default 'x-loki-trace-id'
   */
  requestHeader?: string;

  /**
   * Key used to store the session ID in the storage.
   * @default 'traceId'
   */
  storageKey?: string;

  /**
   * Custom storage implementation. If not provided, an in-memory storage is used.
   */
  storage?: SessionStorage;
}
