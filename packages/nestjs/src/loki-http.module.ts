import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LokiHttpService } from './utils/loki-http.service';

/**
 * LokiHttpModule
 *
 * Import into any feature module that needs traced outgoing HTTP calls.
 * Provides LokiHttpService which auto-injects x-trace-id and x-parent-span-id
 * on every outgoing request, creating a cross-service trace chain.
 *
 * LokiLoggerService and LOKI_LOGGER_OPTIONS are pulled from the global
 * LokiLoggerModule context automatically — no extra imports needed.
 *
 * @example
 * // business.module.ts
 * @Module({
 *   imports: [LokiHttpModule],   // ← just this, no .register() needed
 *   providers: [BusinessService],
 * })
 */
@Module({
  imports: [HttpModule],
  providers: [LokiHttpService],
  exports: [LokiHttpService],
})
export class LokiHttpModule {}
