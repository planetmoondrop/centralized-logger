import { Module } from '@nestjs/common';
import { LokiLoggerModule } from 'moondrop-centralized-logger';
import { TicketsModule } from './tickets/tickets.module';

@Module({
  imports: [
    LokiLoggerModule.register({
      serviceName: 'customer-support',
      lokiHost: process.env['LOKI_HOST'] ?? 'http://localhost:3100',
      logLevel: 'debug',
      consoleOutput: true,
    }),
    TicketsModule,
  ],
})
export class AppModule {}
