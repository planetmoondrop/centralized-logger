import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { SessionInterceptorOptions, SessionStorage } from './types';
import { MemoryStorage } from './storage';

/**
 * Attaches an interceptor to the given Axios instance that manages the `x-session-id` header.
 *
 * On each response, if the response contains the configured header, its value is saved in the storage.
 * On each request, if a session ID exists in the storage, it is added to the request headers.
 *
 * @param axiosInstance - The Axios instance to attach the interceptor to.
 * @param options - Configuration options.
 * @returns The interceptor ID (useful for ejecting later).
 */
export function attachSessionInterceptor(
  axiosInstance: AxiosInstance,
  options: SessionInterceptorOptions = {},
): number {
  const {
    responseHeader = 'x-loki-trace-id',
    requestHeader = 'x-loki-trace-id',
    storageKey = 'traceId',
    storage = new MemoryStorage(),
  } = options;

  // Request interceptor: add session ID to headers if available
  const requestInterceptor = axiosInstance.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      try {
        const sessionId = await storage.getItem(storageKey);
        if (sessionId) {
          config.headers[requestHeader] = sessionId;
        }
      } catch (err) {
        // Silently fail – do not block the request
        console.warn('[axios-session-interceptor] Failed to read session ID:', err);
      }
      return config;
    },
    (error) => Promise.reject(error),
  );

  // Response interceptor: save session ID from response headers
  const responseInterceptor = axiosInstance.interceptors.response.use(
    async (response: AxiosResponse) => {
      const sessionId = response.headers?.[responseHeader];
      if (sessionId && typeof sessionId === 'string') {
        try {
          await storage.setItem(storageKey, sessionId);
        } catch (err) {
          console.warn('[axios-session-interceptor] Failed to save session ID:', err);
        }
      }
      return response;
    },
    (error) => Promise.reject(error),
  );

  // Return the ID of the response interceptor (or combine both? Usually you'd need both IDs)
  // This package returns the response interceptor ID for convenience.
  return responseInterceptor;
}
