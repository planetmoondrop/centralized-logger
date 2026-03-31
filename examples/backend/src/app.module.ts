import { Module } from '@nestjs/common';
import { LokiLoggerModule } from 'moondrop-centralized-logger';
import { GatewayModule } from './gateway/gateway.module';

@Module({
  imports: [
    LokiLoggerModule.register({
      serviceName: 'backend',
      lokiHost: process.env['LOKI_HOST'] ?? 'http://localhost:3100',
      logLevel: 'debug',
      consoleOutput: true,
      enableTraceViewer: true,
      traceViewerServices: 'auth-service,customer-support,backend',
    }),
    GatewayModule,
  ],
})
export class AppModule {}
