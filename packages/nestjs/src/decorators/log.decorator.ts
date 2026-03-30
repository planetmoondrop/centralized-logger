import { getLogger } from '../core/logger-ref';

export interface LogDecoratorOptions {
  /**
   * Log input arguments. Avoid in production for sensitive data.
   * @default false
   */
  args?: boolean;

  /**
   * Log the resolved return value.
   * @default false
   */
  result?: boolean;

  /**
   * Log level for entry/exit messages.
   * @default 'debug'
   */
  level?: 'debug' | 'info' | 'warn';
}

/**
 * @Log() — method decorator for automatic entry/exit logging.
 *
 * Wraps any async service/controller method. Every log line carries
 * the current traceId + spanId + sequence number so it appears in the
 * correct position in the trace viewer timeline.
 *
 * No logger injection needed — works on any class method out of the box
 * once LokiLoggerModule.apply(app) has been called in main.ts.
 *
 * @example
 * @Log()
 * async findUser(id: string): Promise<User> { ... }
 *
 * @example
 * @Log({ args: true, level: 'info' })
 * async createOrder(dto: CreateOrderDto): Promise<Order> { ... }
 */
export function Log(options: LogDecoratorOptions = {}): MethodDecorator {
  return (_target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;
    const level = options.level ?? 'debug';
    const isAsync = originalMethod.constructor.name === 'AsyncFunction';

    const wrapped = function (this: unknown, ...args: unknown[]) {
      const logger = getLogger();
      const className = (this as { constructor: { name: string } }).constructor.name;
      const method = `${className}.${String(propertyKey)}`;
      const start = Date.now();

      const entryMeta: Record<string, unknown> = {};
      if (options.args) entryMeta.args = args;

      logger.logWithType(
        level === 'warn' ? 'warn' : level === 'info' ? 'info' : 'debug',
        `→ ${method}`,
        'service',
        className,
        entryMeta,
      );

      const logExit = (duration: number, result?: unknown) => {
        const exitMeta: Record<string, unknown> = { duration };
        if (options.result) exitMeta.result = result;
        logger.logWithType(
          level === 'warn' ? 'warn' : level === 'info' ? 'info' : 'debug',
          `← ${method} +${duration}ms`,
          'service',
          className,
          exitMeta,
        );
      };

      const logError = (err: unknown, duration: number) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.logWithType('error', `✕ ${method} +${duration}ms — ${message}`, 'service', className, {
          duration,
          stack: err instanceof Error ? err.stack : undefined,
        });
      };

      if (isAsync) {
        return Promise.resolve(originalMethod.apply(this, args))
          .then((result) => {
            logExit(Date.now() - start, result);
            return result;
          })
          .catch((err: unknown) => {
            logError(err, Date.now() - start);
            throw err;
          });
      }

      // Synchronous path — no Promise wrapping, no async overhead.
      try {
        const result = originalMethod.apply(this, args);
        logExit(Date.now() - start, result);
        return result;
      } catch (err: unknown) {
        logError(err, Date.now() - start);
        throw err;
      }
    };

    descriptor.value = wrapped;

    // Preserve TypeScript metadata for NestJS DI
    Reflect.getMetadataKeys(originalMethod).forEach((key: string) => {
      Reflect.defineMetadata(
        key,
        Reflect.getMetadata(key, originalMethod),
        descriptor.value as object,
      );
    });

    return descriptor;
  };
}
