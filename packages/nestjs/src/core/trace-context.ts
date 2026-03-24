import { AsyncLocalStorage } from 'async_hooks';
import { TraceContext } from '../interfaces';

/**
 * Singleton AsyncLocalStorage that holds the active request's TraceContext.
 *
 * Node.js AsyncLocalStorage propagates through all async calls (Promises,
 * callbacks, EventEmitter listeners) that originate from within the run() call,
 * so every service method, TypeORM query, and outgoing HTTP call triggered by
 * a request can read the traceId/spanId WITHOUT needing them passed explicitly.
 */
export const traceStorage = new AsyncLocalStorage<TraceContext>();

/**
 * Returns the TraceContext for the currently executing request.
 * Returns `undefined` if called outside of a request context.
 */
export function getCurrentTrace(): TraceContext | undefined {
  return traceStorage.getStore();
}

/**
 * Returns the traceId string for the current request.
 * Falls back to `'no-trace'` when called outside a request context.
 */
export function getCurrentTraceId(): string {
  return traceStorage.getStore()?.traceId ?? 'no-trace';
}

/**
 * Returns the spanId string for the current request.
 * Falls back to `'no-span'` when called outside a request context.
 */
export function getCurrentSpanId(): string {
  return traceStorage.getStore()?.spanId ?? 'no-span';
}

/**
 * Increments and returns the next sequence number for the current span.
 * Sequence numbers allow the trace viewer to display logs in exact emission
 * order, even when timestamps have millisecond-level collisions.
 *
 * Returns 0 when called outside a request context.
 */
export function nextSequence(): number {
  const store = traceStorage.getStore();
  if (!store) return 0;
  return ++store.sequence;
}
