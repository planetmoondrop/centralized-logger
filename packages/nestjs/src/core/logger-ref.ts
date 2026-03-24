import { LokiLoggerService } from './loki-logger.service';

/**
 * Module-level singleton reference to LokiLoggerService.
 *
 * Set once by LokiLoggerModule.apply() during app bootstrap.
 * Allows decorators, utilities, and non-DI code to log without
 * needing to inject LokiLoggerService via constructor.
 *
 * For NestJS services/controllers, you can still inject it normally:
 *   constructor(private readonly logger: LokiLoggerService) {}
 * But you no longer need to — just use the @Log() decorator on methods
 * and it will automatically use the singleton.
 */
let _instance: LokiLoggerService | null = null;

export function setLoggerRef(service: LokiLoggerService): void {
  _instance = service;
}

export function getLogger(): LokiLoggerService {
  if (!_instance)
    throw new Error(
      '[nestjs-loki-logger] LokiLoggerService not initialised. ' +
        'Call LokiLoggerModule.apply(app) before app.listen().',
    );
  return _instance;
}
