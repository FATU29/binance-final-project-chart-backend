import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly _pubClient: Redis;

  constructor(private readonly appConfig: AppConfigService) {
    const redisConfig = this.appConfig.redis;

    // Publisher client (used for general Redis commands)
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
      this.logger.log('Redis connected');
    });

    this._pubClient.on('error', (err) => {
      this.logger.error('Redis error', err);
    });
  }

  get pubClient(): Redis {
    return this._pubClient;
  }

  async publish(channel: string, message: string): Promise<number> {
    return this._pubClient.publish(channel, message);
  }

  isConnected(): boolean {
    return this._pubClient.status === 'ready';
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting Redis client...');
    await this._pubClient.quit();
  }
}
