'use client'

import axios from 'axios'
import { attachSessionInterceptor } from '@planetmoondrop/logger-client'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3003/api'
export const TRACE_VIEWER = process.env.NEXT_PUBLIC_TRACE_VIEWER ?? 'http://localhost:3003/_trace'

export const api = axios.create({ baseURL: API_BASE })

/**
 * Attaches x-loki-trace-id propagation to every axios request/response.
 * The package manages storage (sessionStorage in browser) and seeding internally.
 * Same-tab page refreshes continue the existing trace; new tabs start fresh.
 */
export const interceptorIds = attachSessionInterceptor(api)

if (typeof window !== 'undefined') {
  console.log('[planetmoondrop-logger-client] interceptors attached', interceptorIds)
}

export function authHeader(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}
