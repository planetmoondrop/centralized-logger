'use client'

import axios from 'axios'
import { attachSessionInterceptor, BrowserSessionStorage } from '@moondrop/logger-client'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003/api'
export const TRACE_VIEWER = process.env.NEXT_PUBLIC_TRACE_VIEWER ?? 'http://localhost:3003/_trace'

export const api = axios.create({ baseURL: API_BASE })

/**
 * BrowserSessionStorage persists the trace ID for the lifetime of the browser
 * tab so that every request — including the very first — carries the same
 * x-loki-trace-id, allowing all backend calls in a session to be correlated.
 *
 * generateInitialId: true seeds a client-generated trace ID immediately so the
 * first request is already traced before any response has been received.
 * The backend will overwrite it with its own traceId on the first response.
 */
export const interceptorIds = attachSessionInterceptor(api, {
  responseHeader: 'x-loki-trace-id',
  requestHeader: 'x-loki-trace-id',
  storageKey: 'lokiTraceId',
  storage: new BrowserSessionStorage(),
  generateInitialId: true,
})

if (typeof window !== 'undefined') {
  console.log('[moondrop-logger-client] interceptors attached', interceptorIds)
}

export function authHeader(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}
