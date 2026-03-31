import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LokiLoggerModule } from 'moondrop-centralized-logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.enableCors({
    origin: (process.env['CORS_ORIGINS'] ?? 'http://localhost:5173,http://localhost:3000')
      .split(',').map(s => s.trim()),
    exposedHeaders: ['x-loki-trace-id', 'x-parent-span-id'],
  });
  app.setGlobalPrefix('api');

  LokiLoggerModule.apply(app);
  LokiLoggerModule.mountViewer(app);

  const port = Number(process.env['PORT'] ?? 3003);
  await app.listen(port);
  console.log(`backend (gateway) running on port ${port}`);
  console.log(`Trace viewer: http://localhost:${port}/_trace`);
}
bootstrap();
