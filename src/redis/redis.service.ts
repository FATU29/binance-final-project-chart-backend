import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly _pubClient: Redis;
  private readonly _subClient: Redis;

  constructor(private readonly appConfig: AppConfigService) {
    const redisConfig = this.appConfig.redis;

    // Publisher client
    this._pubClient = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password || undefined,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this._pubClient.on('connect', () => {
      this.logger.log('Redis Publisher connected');
    });

    this._pubClient.on('error', (err) => {
      this.logger.error('Redis Publisher error', err);
    });

    // Subscriber client (separate connection)
    this._subClient = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password || undefined,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this._subClient.on('connect', () => {
      this.logger.log('Redis Subscriber connected');
    });

    this._subClient.on('error', (err) => {
      this.logger.error('Redis Subscriber error', err);
    });

    this._subClient.on('reconnecting', () => {
      this.logger.warn('Redis Subscriber reconnecting...');
    });
  }

  get pubClient(): Redis {
    return this._pubClient;
  }

  get subClient(): Redis {
    return this._subClient;
  }

  async publish(channel: string, message: string): Promise<number> {
    return this._pubClient.publish(channel, message);
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting Redis clients...');
    await this._pubClient.quit();
    await this._subClient.quit();
  }
}
