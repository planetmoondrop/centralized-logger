import './tracing'; // MUST be first — installs OTEL hooks before any other module loads
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LokiLoggerModule } from 'moondrop-centralized-logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.enableCors({ exposedHeaders: ['x-loki-trace-id', 'x-parent-span-id'] });
  app.setGlobalPrefix('api');

  LokiLoggerModule.apply(app);

  await app.listen(3002);
  console.log('customer-support running on http://localhost:3002');
}
bootstrap();
