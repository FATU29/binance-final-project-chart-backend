import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AppConfigService } from '../../config/app-config.service';
import { PriceProcessor } from './price.processor';
import { PriceQueueService } from './price-queue.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'price',
    }),
  ],
  providers: [PriceProcessor, PriceQueueService, AppConfigService],
  exports: [PriceQueueService],
})
export class PriceQueueModule {}
