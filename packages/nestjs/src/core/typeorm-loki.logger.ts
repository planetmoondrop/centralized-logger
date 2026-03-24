import { Logger as TypeOrmLogger, QueryRunner } from 'typeorm';
import { LokiLoggerService } from './loki-logger.service';

const CONTEXT = 'TypeORM';
const SLOW_QUERY_THRESHOLD_MS = 1_000;

/**
 * TypeORM Logger adapter that routes all database logs through LokiLoggerService.
 *
 * Because LokiLoggerService reads traceId + spanId from AsyncLocalStorage, every
 * query log is automatically linked to the request that triggered it — no wiring needed.
 * The trace viewer will display these as 'db' type entries under the correct span.
 *
 * @example
 * TypeOrmModule.forRootAsync({
 *   inject: [LokiLoggerService],
 *   useFactory: (logger: LokiLoggerService) => ({
 *     ...dbConfig,
 *     logger: new TypeOrmLokiLogger(logger),
 *     logging: true,
 *   }),
 * })
 */
export class TypeOrmLokiLogger implements TypeOrmLogger {
  constructor(private readonly logger: LokiLoggerService) {}

  logQuery(query: string, parameters?: unknown[], _runner?: QueryRunner): void {
    this.logger.logWithType('debug', 'DB query', 'db', CONTEXT, {
      query: this.truncate(query),
      parameters: this.sanitize(parameters),
    });
  }

  logQueryError(
    error: string | Error,
    query: string,
    parameters?: unknown[],
    _runner?: QueryRunner,
  ): void {
    this.logger.logWithType('error', 'DB query error', 'db', CONTEXT, {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      query: this.truncate(query),
      parameters: this.sanitize(parameters),
    });
  }

  logQuerySlow(time: number, query: string, parameters?: unknown[], _runner?: QueryRunner): void {
    this.logger.logWithType('warn', 'DB slow query detected', 'db', CONTEXT, {
      durationMs: time,
      thresholdMs: SLOW_QUERY_THRESHOLD_MS,
      query: this.truncate(query),
      parameters: this.sanitize(parameters),
    });
  }

  logSchemaBuild(message: string, _runner?: QueryRunner): void {
    this.logger.logWithType('debug', message, 'db', `${CONTEXT}:Schema`);
  }

  logMigration(message: string, _runner?: QueryRunner): void {
    this.logger.logWithType('info', message, 'db', `${CONTEXT}:Migration`);
  }

  log(level: 'log' | 'info' | 'warn', message: unknown, _runner?: QueryRunner): void {
    const msg = String(message);
    if (level === 'warn') {
      this.logger.logWithType('warn', msg, 'db', CONTEXT);
    } else {
      this.logger.logWithType('debug', msg, 'db', CONTEXT);
    }
  }

  private truncate(query: string, max = 2_000): string {
    return query.length > max ? `${query.slice(0, max)}…` : query;
  }

  private sanitize(params?: unknown[]): unknown[] | undefined {
    if (!params) return undefined;
    return params.map((p) => (typeof p === 'string' && p.length > 40 ? '[REDACTED]' : p));
  }
}
