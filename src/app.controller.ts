import { Controller, Get } from '@nestjs/common';
import { BinanceStreamService } from './binance/binance-stream.service';

@Controller()
export class AppController {
  constructor(private readonly binanceService: BinanceStreamService) {}

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      binance: {
        connected: this.binanceService.isConnected(),
      },
    };
  }
}
