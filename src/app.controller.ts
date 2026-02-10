import { Controller, Get } from '@nestjs/common';
import { BinanceStreamService } from './binance/binance-stream.service';
import { RedisService } from './redis/redis.service';
import { PriceGateway } from './realtime/price.gateway';

@Controller()
export class AppController {
  constructor(
    private readonly binanceService: BinanceStreamService,
    private readonly redisService: RedisService,
    private readonly priceGateway: PriceGateway,
  ) {}

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      binance: {
        connected: this.binanceService.isConnected(),
      },
      redis: {
        connected: this.redisService.isConnected(),
      },
    };
  }

  @Get('health/binance')
  getBinanceStatus() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      binance: this.binanceService.getConnectionStatus(),
    };
  }

  @Get('health/websocket')
  getWebSocketStatus() {
    const adapter = this.priceGateway.server?.adapter as any;
    const rooms = adapter?.rooms;
    const roomInfo: Record<string, number> = {};

    if (rooms) {
      rooms.forEach((sockets: Set<string>, room: string) => {
        if (room.startsWith('BTC') || room.startsWith('ETH')) {
          roomInfo[room] = sockets.size;
        }
      });
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      connectedClients: (this.priceGateway.server?.sockets as any)?.size || 0,
      rooms: roomInfo,
      redis: {
        connected: this.redisService.isConnected(),
      },
    };
  }
}
