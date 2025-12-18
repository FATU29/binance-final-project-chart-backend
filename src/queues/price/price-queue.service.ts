import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PriceJobData } from './price-job.interface';

@Injectable()
export class PriceQueueService {
  private readonly logger = new Logger(PriceQueueService.name);

  constructor(@InjectQueue('price') private priceQueue: Queue) {}

  async addPersistPriceJob(data: PriceJobData): Promise<void> {
    try {
      await this.priceQueue.add('persistPrice', data, {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });
      this.logger.debug(`Added persistPrice job for ${data.symbol}`);
    } catch (error) {
      this.logger.error(`Failed to add job for ${data.symbol}`, error);
    }
  }
}
