import { Module, forwardRef } from '@nestjs/common';
import { BinanceStreamService } from './binance-stream.service';
import { BinanceHistoryService } from './binance-history.service';
import { BinanceHistoryController } from './binance-history.controller';
import { AppConfigService } from '../config/app-config.service';
import { PriceQueueModule } from '../queues/price/price-queue.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [PriceQueueModule, DatabaseModule, forwardRef(() => RealtimeModule)],
  controllers: [BinanceHistoryController],
  providers: [BinanceStreamService, BinanceHistoryService, AppConfigService],
  exports: [BinanceStreamService, BinanceHistoryService],
})
export class BinanceModule {}
