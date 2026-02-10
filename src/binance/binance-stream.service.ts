import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import WebSocket from 'ws';
import { AppConfigService } from '../config/app-config.service';
import { PriceQueueService } from '../queues/price/price-queue.service';
import { PriceGateway } from '../realtime/price.gateway';
import { BinanceHistoryService } from './binance-history.service';
import {
  BinanceCombinedStreamMessage,
  BinanceMiniTickerPayload,
  BinanceTradePayload,
  BinanceKlinePayload,
  PriceData,
} from './binance.types';

// Throttle interval per symbol for price broadcasts (ms)
const PRICE_THROTTLE_MS = 200;
// Throttle interval per symbol+interval for kline broadcasts (ms)
const KLINE_THROTTLE_MS = 500;
// Throttle interval per symbol for DB persistence (ms)
const PERSIST_THROTTLE_MS = 1000;

@Injectable()
export class BinanceStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BinanceStreamService.name);
  private ws: WebSocket;
  private reconnectTimeout: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly baseReconnectDelay = 1000;

  // Throttle maps: symbol -> last broadcast timestamp
  private readonly lastPriceBroadcast = new Map<string, number>();
  private readonly lastKlineBroadcast = new Map<string, number>();
  // Pending latest data per symbol (for coalesced broadcast)
  private readonly pendingPrice = new Map<string, PriceData>();
  private readonly pendingKline = new Map<string, BinanceKlinePayload>();
  private throttleTimers = new Map<string, NodeJS.Timeout>();
  // Throttle map for DB persistence
  private readonly lastPersist = new Map<string, number>();
  // Throttle map for kline persistence to MongoDB
  private readonly lastKlinePersist = new Map<string, number>();

  constructor(
    private readonly appConfig: AppConfigService,
    @Inject(forwardRef(() => PriceGateway))
    private readonly priceGateway: PriceGateway,
    private readonly priceQueueService: PriceQueueService,
    private readonly binanceHistoryService: BinanceHistoryService,
  ) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    this.logger.log('Closing Binance WebSocket connection...');
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    // Clear all throttle timers
    for (const timer of this.throttleTimers.values()) {
      clearTimeout(timer);
    }
    this.throttleTimers.clear();
    if (this.ws) {
      this.ws.close();
    }
  }

  private async connect() {
    try {
      const binanceConfig = this.appConfig.binance;
      const streams = binanceConfig.streams.split(',').map((s) => s.trim());

      // Binance combined streams format: /stream?streams=stream1/stream2/stream3
      // Streams should be separated by forward slashes
      const streamPath = streams.join('/');

      // Combined stream URL - Binance API format
      const wsUrl = `${binanceConfig.spotWsBase}/stream?streams=${streamPath}`;
      this.logger.log(`🔌 Connecting to Binance WebSocket: ${wsUrl}`);
      this.logger.log(`📊 Streams configured: ${streams.join(', ')}`);

      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        this.logger.log('✅ Binance WebSocket connected successfully');
        this.logger.log(
          `📡 Listening to ${streams.length} streams from Binance`,
        );
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
      const message: BinanceCombinedStreamMessage = JSON.parse(
        typeof data === 'string' ? data : data.toString(),
      );
      const payload = message.data;
      if (!payload || !payload.e) return;

      const priceData = this.extractPriceData(message.stream, payload);
      if (priceData) {
        this.publishPrice(priceData);
      }
    } catch (error) {
      this.logger.error('❌ Error handling Binance message', error);
    }
  }

  private extractPriceData(stream: string, payload: any): PriceData | null {
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

  private publishPrice(priceData: PriceData) {
    const { symbol, raw } = priceData;
    const now = Date.now();
    const isKline = raw && raw.e === 'kline';

    if (isKline) {
      // Throttle kline broadcasts per symbol+interval
      const klineData = raw as BinanceKlinePayload;
      const klineKey = `${symbol}:${klineData.k.i}`;
      const lastKline = this.lastKlineBroadcast.get(klineKey) || 0;

      this.pendingKline.set(klineKey, klineData);
      // Also store latest price for this symbol
      this.pendingPrice.set(symbol, priceData);

      if (now - lastKline >= KLINE_THROTTLE_MS) {
        this.lastKlineBroadcast.set(klineKey, now);
        this.priceGateway.broadcastKline(symbol, klineData);
        // Also broadcast price from kline
        this.lastPriceBroadcast.set(symbol, now);
        this.priceGateway.broadcastPrice(symbol, priceData);
      } else {
        this.scheduleThrottledBroadcast(
          klineKey,
          symbol,
          KLINE_THROTTLE_MS - (now - lastKline),
        );
      }

      // Persist kline to MongoDB:
      // - Closed klines (x=true): always persist immediately
      // - Open klines: throttle to every 5 seconds
      const KLINE_PERSIST_THROTTLE_MS = 5000;
      const lastKlinePersistTime = this.lastKlinePersist.get(klineKey) || 0;

      if (
        klineData.k.x ||
        now - lastKlinePersistTime >= KLINE_PERSIST_THROTTLE_MS
      ) {
        this.lastKlinePersist.set(klineKey, now);
        this.binanceHistoryService
          .persistKlineFromStream(symbol, klineData.k.i, klineData.k)
          .catch((err) => {
            this.logger.error(`❌ Kline persist error for ${klineKey}`, err);
          });
      }
    } else {
      // Throttle price broadcasts per symbol
      const lastPrice = this.lastPriceBroadcast.get(symbol) || 0;
      this.pendingPrice.set(symbol, priceData);

      if (now - lastPrice >= PRICE_THROTTLE_MS) {
        this.lastPriceBroadcast.set(symbol, now);
        this.priceGateway.broadcastPrice(symbol, priceData);
      } else if (!this.throttleTimers.has(`price:${symbol}`)) {
        // Schedule broadcast of latest data after throttle window
        const delay = PRICE_THROTTLE_MS - (now - lastPrice);
        const timer = setTimeout(() => {
          this.throttleTimers.delete(`price:${symbol}`);
          const latest = this.pendingPrice.get(symbol);
          if (latest) {
            this.lastPriceBroadcast.set(symbol, Date.now());
            this.priceGateway.broadcastPrice(symbol, latest);
          }
        }, delay);
        this.throttleTimers.set(`price:${symbol}`, timer);
      }
    }

    // Throttle DB persistence — at most once per PERSIST_THROTTLE_MS per symbol
    const lastPersistTime = this.lastPersist.get(symbol) || 0;
    if (now - lastPersistTime >= PERSIST_THROTTLE_MS) {
      this.lastPersist.set(symbol, now);
      this.priceQueueService.addPersistPriceJob(priceData).catch((err) => {
        this.logger.error(`❌ Queue error for ${symbol}`, err);
      });
    }
  }

  private scheduleThrottledBroadcast(
    klineKey: string,
    symbol: string,
    delay: number,
  ) {
    const timerKey = `kline:${klineKey}`;
    if (this.throttleTimers.has(timerKey)) return;

    const timer = setTimeout(() => {
      this.throttleTimers.delete(timerKey);
      const latestKline = this.pendingKline.get(klineKey);
      const latestPrice = this.pendingPrice.get(symbol);
      if (latestKline) {
        this.lastKlineBroadcast.set(klineKey, Date.now());
        this.priceGateway.broadcastKline(symbol, latestKline);
      }
      if (latestPrice) {
        this.lastPriceBroadcast.set(symbol, Date.now());
        this.priceGateway.broadcastPrice(symbol, latestPrice);
      }
    }, delay);
    this.throttleTimers.set(timerKey, timer);
  }

  isConnected(): boolean {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  getConnectionStatus() {
    if (!this.ws) {
      return {
        connected: false,
        state: 'NOT_INITIALIZED',
        reconnectAttempts: this.reconnectAttempts,
        maxReconnectAttempts: this.maxReconnectAttempts,
      };
    }

    const states = {
      [WebSocket.CONNECTING]: 'CONNECTING',
      [WebSocket.OPEN]: 'OPEN',
      [WebSocket.CLOSING]: 'CLOSING',
      [WebSocket.CLOSED]: 'CLOSED',
    };

    return {
      connected: this.ws.readyState === WebSocket.OPEN,
      state: states[this.ws.readyState] || 'UNKNOWN',
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      url: this.ws.url || 'N/A',
    };
  }
}
