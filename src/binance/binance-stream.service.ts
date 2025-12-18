import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import WebSocket from 'ws';
import { AppConfigService } from '../config/app-config.service';
import { RedisService } from '../redis/redis.service';
import { PriceQueueService } from '../queues/price/price-queue.service';
import {
  BinanceCombinedStreamMessage,
  BinanceMiniTickerPayload,
  BinanceTradePayload,
  BinanceKlinePayload,
  PriceData,
} from './binance.types';

@Injectable()
export class BinanceStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BinanceStreamService.name);
  private ws: WebSocket;
  private reconnectTimeout: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly baseReconnectDelay = 1000;

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly redisService: RedisService,
    private readonly priceQueueService: PriceQueueService,
  ) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    this.logger.log('Closing Binance WebSocket connection...');
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.ws) {
      this.ws.close();
    }
  }

  private async connect() {
    try {
      const binanceConfig = this.appConfig.binance;
      const streams = binanceConfig.streams.split(',').map((s) => s.trim());
      const streamPath = streams.join('/');

      // Combined stream URL
      const wsUrl = `${binanceConfig.spotWsBase}/stream?streams=${streamPath}`;
      this.logger.log(`Connecting to Binance WebSocket: ${wsUrl}`);

      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        this.logger.log('Binance WebSocket connected');
        this.reconnectAttempts = 0;
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        this.logger.error('Binance WebSocket error', error);
      });

      this.ws.on('close', () => {
        this.logger.warn('Binance WebSocket closed');
        this.scheduleReconnect();
      });

      this.ws.on('ping', () => {
        this.ws.pong();
      });
    } catch (error) {
      this.logger.error('Failed to connect to Binance WebSocket', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached. Giving up.');
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      30000,
    );
    this.reconnectAttempts++;

    this.logger.log(
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    );

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleMessage(data: WebSocket.Data) {
    try {
      const message: BinanceCombinedStreamMessage = JSON.parse(data.toString());
      const { stream, data: payload } = message;

      const priceData = this.extractPriceData(stream, payload);
      if (priceData) {
        this.publishPrice(priceData);
      }
    } catch (error) {
      this.logger.error('Error handling message', error);
    }
  }

  private extractPriceData(
    stream: string,
    payload: any,
  ): PriceData | null {
    try {
      let symbol: string;
      let price: string;
      let ts: number;

      if (payload.e === '24hrMiniTicker') {
        const data = payload as BinanceMiniTickerPayload;
        symbol = data.s;
        price = data.c; // Close price
        ts = data.E;
      } else if (payload.e === 'trade') {
        const data = payload as BinanceTradePayload;
        symbol = data.s;
        price = data.p;
        ts = data.E;
      } else if (payload.e === 'kline') {
        const data = payload as BinanceKlinePayload;
        symbol = data.s;
        price = data.k.c; // Close price
        ts = data.E;
      } else {
        this.logger.warn(`Unknown event type: ${payload.e}`);
        return null;
      }

      return {
        symbol,
        price,
        ts,
        raw: payload,
      };
    } catch (error) {
      this.logger.error('Error extracting price data', error);
      return null;
    }
  }

  private async publishPrice(priceData: PriceData) {
    const { symbol, price, ts } = priceData;

    try {
      // Publish to Redis Pub/Sub
      const channel = `prices:${symbol}`;
      const message = JSON.stringify(priceData);
      await this.redisService.publish(channel, message);

      // Add job to BullMQ
      await this.priceQueueService.addPersistPriceJob(priceData);

      this.logger.debug(`Published price for ${symbol}: ${price}`);
    } catch (error) {
      this.logger.error(`Error publishing price for ${symbol}`, error);
    }
  }

  isConnected(): boolean {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}
