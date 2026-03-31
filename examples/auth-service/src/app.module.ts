import { Module } from '@nestjs/common';
import { LokiLoggerModule } from 'moondrop-centralized-logger';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    LokiLoggerModule.register({
      serviceName: 'auth-service',
      lokiHost: process.env['LOKI_HOST'] ?? 'http://localhost:3100',
      logLevel: 'debug',
      consoleOutput: true,
      enableTraceViewer: true,
      traceViewerServices: 'auth-service,customer-support,backend',
    }),
    AuthModule,
  ],
})
export class AppModule {}
