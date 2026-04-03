import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { LokiLoggerService } from '../core/loki-logger.service';

import { getCurrentTrace } from '../core/trace-context';

/**
 * LokiLoggingInterceptor
 *
 * Attaches handler-level entry/exit logs (logType: 'interceptor') to every
 * controller method. Captures unhandled exceptions and logs them with full
 * stack trace before re-throwing so NestJS exception filters still work.
 *
 * Register globally in main.ts:
 * @example
 * app.useGlobalInterceptors(app.get(LokiLoggingInterceptor));
 */
@Injectable()
export class LokiLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LokiLoggerService) {}

  intercept(executionCtx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handlerName = `${executionCtx.getClass().name}.${executionCtx.getHandler().name}`;
    const trace = getCurrentTrace();
    const start = Date.now();

    this.logger.logWithType('debug', `Enter ${handlerName}`, 'interceptor', 'Interceptor', {
      traceId: trace?.traceId,
      spanId: trace?.spanId,
    });

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        this.logger.logWithType(
          'debug',
          `Exit  ${handlerName} +${duration}ms`,
          'interceptor',
          'Interceptor',
          {
            traceId: trace?.traceId,
            spanId: trace?.spanId,
            duration,
          },
        );
      }),
      catchError((err: Error) => {
        const duration = Date.now() - start;
        this.logger.logWithType(
          'error',
          `Error ${handlerName} +${duration}ms — ${err?.message}`,
          'interceptor',
          'Interceptor',
          {
            traceId: trace?.traceId,
            spanId: trace?.spanId,
            duration,
            stack: err?.stack,
          },
        );
        return throwError(() => err);
      }),
    );
  }
}
