import { Module } from '@nestjs/common';
import { LokiHttpModule } from '@moondrop/centralized-logger';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';

@Module({
  // LokiHttpModule provides LokiHttpService which auto-injects x-loki-trace-id
  // on every outgoing HTTP call — this is what creates the cross-service trace chain.
  imports: [LokiHttpModule],
  controllers: [GatewayController],
  providers: [GatewayService],
})
export class GatewayModule {}
