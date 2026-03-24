import { Inject } from '@nestjs/common';
import { LokiLoggerService } from '../core/loki-logger.service';

/**
 * Shorthand property decorator for injecting LokiLoggerService.
 *
 * Instead of:
 * @example
 * constructor(private readonly logger: LokiLoggerService) {}
 *
 * You can write:
 * @example
 * @InjectLogger()
 * private readonly logger: LokiLoggerService;
 */
export const InjectLogger = (): PropertyDecorator & ParameterDecorator => Inject(LokiLoggerService);
