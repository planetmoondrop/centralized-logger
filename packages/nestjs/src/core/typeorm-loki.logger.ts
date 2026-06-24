import { LokiLoggerService } from './loki-logger.service';
import { filterUserStackTrace } from './stack-trace-filter';

const CONTEXT = 'TypeORM';
const SLOW_QUERY_THRESHOLD_MS = 1_000;

/**
 * Minimal mirror of TypeORM's Logger interface (0.3.x).
 * Defined locally so the class loads even when typeorm is not installed.
 */
interface TypeOrmLoggerContract {
  logQuery(query: string, parameters?: unknown[], queryRunner?: unknown): void;
  logQueryError(
    error: string | Error,
    query: string,
    parameters?: unknown[],
    queryRunner?: unknown,
  ): void;
  logQuerySlow(
    time: number,
    query: string,
    parameters?: unknown[],
    queryRunner?: unknown,
  ): void;
  logSchemaBuild(message: string, queryRunner?: unknown): void;
  logMigration(message: string, queryRunner?: unknown): void;
  log(level: 'log' | 'info' | 'warn', message: unknown, queryRunner?: unknown): void;
}

/**
 * TypeORM Logger adapter that routes all database logs through LokiLoggerService.
 *
 * Because LokiLoggerService reads traceId + spanId from AsyncLocalStorage, every
 * query log is automatically linked to the request that triggered it — no wiring needed.
 * The trace viewer will display these as 'db' type entries under the correct span.
 *
 * Prefer `TypeOrmLokiLogger.create(logger)` over `new TypeOrmLokiLogger(logger)` —
 * the factory validates the installed TypeORM version and warns if it is unsupported.
 *
 * @example
 * TypeOrmModule.forRootAsync({
 *   inject: [LokiLoggerService],
 *   useFactory: (logger: LokiLoggerService) => ({
 *     ...dbConfig,
 *     logger: TypeOrmLokiLogger.create(logger),
 *     logging: true,
 *   }),
 * })
 */
export class TypeOrmLokiLogger implements TypeOrmLoggerContract {
  constructor(private readonly logger: LokiLoggerService) {}

  /**
   * Recommended factory — validates that typeorm is installed and is a
   * supported version before returning an instance. Logs a warning and
   * still returns an instance on mismatch so the app continues to boot.
   */
  static create(logger: LokiLoggerService): TypeOrmLokiLogger {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pkg = require('typeorm/package.json') as { version: string };
      const [majorStr, minorStr] = pkg.version.split('.');
      const major = parseInt(majorStr, 10);
      const minor = parseInt(minorStr, 10);
      if (major === 0 && minor < 3) {
        logger.logWithType(
          'warn',
          `TypeOrmLokiLogger: detected typeorm@${pkg.version}, requires ^0.3.x — DB logs may be incomplete`,
          'db',
          CONTEXT,
        );
      }
    } catch {
      logger.logWithType(
        'warn',
        'TypeOrmLokiLogger: typeorm package not found — DB logging disabled. Install typeorm ^0.3.x.',
        'db',
        CONTEXT,
      );
    }
    return new TypeOrmLokiLogger(logger);
  }

  logQuery(query: string, parameters?: unknown[], _runner?: unknown): void {
    this.logger.logWithType('debug', 'DB query', 'db', CONTEXT, {
      query: this.truncate(query),
      parameters: this.sanitize(parameters),
    });
  }

  logQueryError(
    error: string | Error,
    query: string,
    parameters?: unknown[],
    _runner?: unknown,
  ): void {
    this.logger.logWithType('error', 'DB query error', 'db', CONTEXT, {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? filterUserStackTrace(error.stack) : undefined,
      query: this.truncate(query),
      parameters: this.sanitize(parameters),
    });
  }

  logQuerySlow(time: number, query: string, parameters?: unknown[], _runner?: unknown): void {
    this.logger.logWithType('warn', 'DB slow query detected', 'db', CONTEXT, {
      durationMs: time,
      thresholdMs: SLOW_QUERY_THRESHOLD_MS,
      query: this.truncate(query),
      parameters: this.sanitize(parameters),
    });
  }

  logSchemaBuild(message: string, _runner?: unknown): void {
    this.logger.logWithType('debug', message, 'db', `${CONTEXT}:Schema`);
  }

  logMigration(message: string, _runner?: unknown): void {
    this.logger.logWithType('info', message, 'db', `${CONTEXT}:Migration`);
  }

  log(level: 'log' | 'info' | 'warn', message: unknown, _runner?: unknown): void {
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
