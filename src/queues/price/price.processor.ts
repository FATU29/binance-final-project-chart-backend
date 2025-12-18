import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PriceJobData } from './price-job.interface';

@Processor('price')
export class PriceProcessor extends WorkerHost {
  private readonly logger = new Logger(PriceProcessor.name);

  async process(job: Job<PriceJobData>): Promise<any> {
    const { symbol, price, ts } = job.data;

    try {
      switch (job.name) {
        case 'persistPrice':
          await this.handlePersistPrice(job.data);
          break;
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
      }

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Error processing job ${job.name} for ${symbol}`,
        error,
      );
      throw error;
    }
  }

  private async handlePersistPrice(data: PriceJobData): Promise<void> {
    const { symbol, price, ts } = data;

    // TODO: Implement actual persistence logic
    // Example: Save to database (MongoDB, PostgreSQL, etc.)
    this.logger.log(
      `[PERSIST] ${symbol}: ${price} at ${new Date(ts).toISOString()}`,
    );

    // Example: Compute statistics
    // await this.computeStats(symbol, price);

    // Example: Check alerts
    // await this.checkAlerts(symbol, price);
  }
}
