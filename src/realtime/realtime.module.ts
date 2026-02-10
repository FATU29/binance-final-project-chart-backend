import { Module } from '@nestjs/common';
import { PriceGateway } from './price.gateway';

@Module({
  providers: [PriceGateway],
  exports: [PriceGateway],
})
export class RealtimeModule {}
