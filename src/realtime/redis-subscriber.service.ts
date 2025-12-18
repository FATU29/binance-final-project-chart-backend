import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PriceGateway } from './price.gateway';
import { PriceData } from '../binance/binance.types';

@Injectable()
export class RedisSubscriberService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisSubscriberService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly priceGateway: PriceGateway,
  ) {}

  async onModuleInit() {
    await this.subscribeToChannels();
  }

  async onModuleDestroy() {
    this.logger.log('Unsubscribing from Redis channels...');
    await this.redisService.subClient.punsubscribe('prices:*');
  }

  private async subscribeToChannels() {
    const subClient = this.redisService.subClient;

    // Pattern subscribe to all price channels
    await subClient.psubscribe('prices:*', (err, count) => {
      if (err) {
        this.logger.error('Failed to subscribe to Redis channels', err);
        return;
      }
      this.logger.log(`Subscribed to ${count} channel pattern(s)`);
    });

    // Handle messages
    subClient.on('pmessage', (pattern, channel, message) => {
      this.handleMessage(pattern, channel, message);
    });

    this.logger.log('Redis subscriber initialized');
  }

  private handleMessage(pattern: string, channel: string, message: string) {
    try {
      const priceData: PriceData = JSON.parse(message);
      const { symbol } = priceData;

      this.logger.debug(`Received price from Redis channel ${channel}: ${priceData.price}`);

      // Broadcast to WebSocket clients
      this.priceGateway.broadcastPrice(symbol, priceData);
    } catch (error) {
      this.logger.error('Error handling Redis message', error);
    }
  }
}
