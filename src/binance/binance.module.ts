import { Module } from '@nestjs/common';
import { BinanceStreamService } from './binance-stream.service';
import { AppConfigService } from '../config/app-config.service';
import { PriceQueueModule } from '../queues/price/price-queue.module';

@Module({
  imports: [PriceQueueModule],
  providers: [BinanceStreamService, AppConfigService],
  exports: [BinanceStreamService],
})
export class BinanceModule {}
