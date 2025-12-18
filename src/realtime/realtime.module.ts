import { Module } from '@nestjs/common';
import { PriceGateway } from './price.gateway';
import { RedisSubscriberService } from './redis-subscriber.service';

@Module({
  providers: [PriceGateway, RedisSubscriberService],
  exports: [PriceGateway],
})
export class RealtimeModule {}
