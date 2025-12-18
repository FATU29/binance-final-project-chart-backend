import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisConfig } from './redis.config';
import { BinanceConfig } from './binance.config';

@Injectable()
export class AppConfigService {
  constructor(private configService: ConfigService) {}

  get redis(): RedisConfig {
    return {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD', ''),
    };
  }

  get binance(): BinanceConfig {
    return {
      spotWsBase: this.configService.get<string>(
        'BINANCE_SPOT_WS_BASE',
        'wss://stream.binance.com:9443',
      ),
      spotRestBase: this.configService.get<string>(
        'BINANCE_SPOT_REST_BASE',
        'https://api.binance.com',
      ),
      streams: this.configService.get<string>(
        'BINANCE_STREAMS',
        'btcusdt@miniTicker',
      ),
    };
  }

  get priceQueueName(): string {
    return this.configService.get<string>('PRICE_QUEUE_NAME', 'price');
  }

  get frontendUrl(): string {
    return this.configService.get<string>('FRONTEND_URL', '*');
  }

  get port(): number {
    return this.configService.get<number>('PORT', 3000);
  }
}
