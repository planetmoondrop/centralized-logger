import './tracing'; // MUST be first — installs OTEL hooks before any other module loads
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LokiLoggerModule } from '@planetmoondrop/centralized-logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.enableCors({ exposedHeaders: ['x-loki-trace-id', 'x-parent-span-id'] });
  app.setGlobalPrefix('api');

  LokiLoggerModule.apply(app);
  LokiLoggerModule.mountViewer(app);

  await app.listen(3001);
  console.log('auth-service running on http://localhost:3001');
  console.log('Trace viewer: http://localhost:3001/_trace');
}
bootstrap();
