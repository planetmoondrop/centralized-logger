'use client'

import axios from 'axios'
import { attachSessionInterceptor } from '@moondrop/logger-client'

const API_BASE     = process.env.NEXT_PUBLIC_API_URL      ?? 'http://localhost:3003/api'
export const TRACE_VIEWER = process.env.NEXT_PUBLIC_TRACE_VIEWER ?? 'http://localhost:3003/_trace'

export const api = axios.create({ baseURL: API_BASE })

// Attach moondrop logger-client interceptor — mirrors original main.js exactly
export const interceptorIds = attachSessionInterceptor(api, {
  responseHeader: 'x-loki-trace-id',
  requestHeader:  'x-loki-trace-id',
  storageKey:     'lokiTraceId',
})

if (typeof window !== 'undefined') {
  console.log('[logger-client] interceptors attached', interceptorIds)
}

export function authHeader(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}
