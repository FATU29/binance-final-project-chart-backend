import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  OnModuleInit,
} from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { KlineRepository } from '../database/kline.repository';
import {
  BinanceKlineData,
  HistoricalKline,
  HistoricalDataQuery,
} from './binance.types';

// Map interval string to duration in milliseconds for freshness checks
const INTERVAL_DURATION_MS: Record<string, number> = {
  '1m': 60_000,
  '3m': 3 * 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h': 3_600_000,
  '2h': 2 * 3_600_000,
  '4h': 4 * 3_600_000,
  '6h': 6 * 3_600_000,
  '8h': 8 * 3_600_000,
  '12h': 12 * 3_600_000,
  '1d': 86_400_000,
  '3d': 3 * 86_400_000,
  '1w': 7 * 86_400_000,
  '1M': 30 * 86_400_000,
};

// Intervals to seed on startup
const SEED_CONFIG = {
  symbols: [
    'BTCUSDT',
    'ETHUSDT',
    'BNBUSDT',
    'XRPUSDT',
    'SOLUSDT',
    'ADAUSDT',
    'DOGEUSDT',
  ],
  intervals: ['1m', '5m', '15m', '1h', '4h', '1d'],
  seedLimit: 1000,
};

@Injectable()
export class BinanceHistoryService implements OnModuleInit {
  private readonly logger = new Logger(BinanceHistoryService.name);
  private readonly restBaseUrl: string;

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly klineRepository: KlineRepository,
  ) {
    this.restBaseUrl = this.appConfig.binance.spotRestBase;
  }

  async onModuleInit() {
    // Seed historical data in the background (don't block startup)
    this.seedHistoricalData().catch((err) => {
      this.logger.error('Failed to seed historical data', err);
    });
  }

  /**
   * Get historical klines — DB first, fill gaps from Binance REST API
   */
  async getHistoricalKlines(
    query: HistoricalDataQuery,
  ): Promise<HistoricalKline[]> {
    const { symbol, interval, startTime, endTime, limit = 500 } = query;
    const normalizedSymbol = symbol.toUpperCase();
    const effectiveLimit = Math.min(limit, 1000);

    try {
      // 1. Try to get from DB
      const dbKlines = await this.klineRepository.findKlines(
        normalizedSymbol,
        interval,
        startTime,
        endTime,
        effectiveLimit,
      );

      if (dbKlines.length >= effectiveLimit) {
        // Freshness check: ensure the most recent kline is not too stale
        const intervalMs = INTERVAL_DURATION_MS[interval] || 3_600_000;
        const latestKline = dbKlines[dbKlines.length - 1];
        const now = Date.now();
        const gap = now - (latestKline?.openTime || 0);

        if (gap <= intervalMs * 3) {
          // Data is fresh enough
          this.logger.debug(
            `Served ${dbKlines.length} klines for ${normalizedSymbol} ${interval} from DB`,
          );
          return dbKlines.map((k) => this.toHistoricalKline(k));
        }

        // Data is stale — fall through to fetch fresh data from Binance
        this.logger.warn(
          `DB data for ${normalizedSymbol} ${interval} is stale (gap: ${Math.round(gap / 60_000)}min). Fetching fresh data from Binance.`,
        );
      }

      // 2. DB doesn't have enough — fetch from Binance REST and cache
      const binanceData = await this.fetchFromBinance(
        normalizedSymbol,
        interval,
        startTime,
        endTime,
        effectiveLimit,
      );

      // Store in DB asynchronously
      this.storeKlines(normalizedSymbol, interval, binanceData).catch((err) =>
        this.logger.error('Failed to cache klines to DB', err),
      );

      return binanceData;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      this.logger.error('Error fetching historical klines', error);
      throw new HttpException(
        'Failed to fetch historical data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Persist a kline from WebSocket stream (called by BinanceStreamService)
   */
  async persistKlineFromStream(
    symbol: string,
    interval: string,
    klineData: {
      t: number;
      T: number;
      o: string;
      h: string;
      l: string;
      c: string;
      v: string;
      q: string;
      n: number;
      x: boolean;
      V: string;
      Q: string;
    },
  ): Promise<void> {
    await this.klineRepository.upsertKline({
      symbol: symbol.toUpperCase(),
      interval,
      openTime: klineData.t,
      closeTime: klineData.T,
      open: klineData.o,
      high: klineData.h,
      low: klineData.l,
      close: klineData.c,
      volume: klineData.v,
      quoteVolume: klineData.q,
      trades: klineData.n,
      takerBuyBaseVolume: klineData.V,
      takerBuyQuoteVolume: klineData.Q,
      isClosed: klineData.x,
    });
  }

  /**
   * Fetch from Binance REST API
   */
  private async fetchFromBinance(
    symbol: string,
    interval: string,
    startTime?: number,
    endTime?: number,
    limit = 500,
  ): Promise<HistoricalKline[]> {
    const params = new URLSearchParams({
      symbol,
      interval,
      limit: Math.min(limit, 1000).toString(),
    });

    if (startTime) params.append('startTime', startTime.toString());
    if (endTime) params.append('endTime', endTime.toString());

    const url = `${this.restBaseUrl}/api/v3/klines?${params.toString()}`;

    this.logger.log(
      `Fetching from Binance REST: ${symbol} ${interval} (limit: ${limit})`,
    );

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Binance API error: ${response.status} - ${errorText}`);
      throw new HttpException(
        `Failed to fetch from Binance: ${response.statusText}`,
        response.status === 429
          ? HttpStatus.TOO_MANY_REQUESTS
          : HttpStatus.BAD_GATEWAY,
      );
    }

    const data: BinanceKlineData[] = await response.json();

    return data.map((kline) => ({
      openTime: kline[0],
      open: kline[1],
      high: kline[2],
      low: kline[3],
      close: kline[4],
      volume: kline[5],
      closeTime: kline[6],
      quoteVolume: kline[7],
      trades: kline[8],
      takerBuyBaseVolume: kline[9],
      takerBuyQuoteVolume: kline[10],
    }));
  }

  /**
   * Store historical klines to MongoDB
   */
  private async storeKlines(
    symbol: string,
    interval: string,
    klines: HistoricalKline[],
  ): Promise<void> {
    const docs = klines.map((k) => ({
      symbol: symbol.toUpperCase(),
      interval,
      openTime: k.openTime,
      closeTime: k.closeTime,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
      quoteVolume: k.quoteVolume,
      trades: k.trades,
      takerBuyBaseVolume: k.takerBuyBaseVolume,
      takerBuyQuoteVolume: k.takerBuyQuoteVolume,
      isClosed: true,
    }));

    const count = await this.klineRepository.bulkUpsertKlines(docs);
    this.logger.debug(`Stored ${count} klines for ${symbol} ${interval} in DB`);
  }

  /**
   * Convert DB document to HistoricalKline response format
   */
  private toHistoricalKline(doc: any): HistoricalKline {
    return {
      openTime: doc.openTime,
      open: doc.open,
      high: doc.high,
      low: doc.low,
      close: doc.close,
      volume: doc.volume,
      closeTime: doc.closeTime,
      quoteVolume: doc.quoteVolume || '0',
      trades: doc.trades || 0,
      takerBuyBaseVolume: doc.takerBuyBaseVolume || '0',
      takerBuyQuoteVolume: doc.takerBuyQuoteVolume || '0',
    };
  }

  /**
   * Seed historical data for major pairs on startup
   */
  private async seedHistoricalData(): Promise<void> {
    this.logger.log('🌱 Starting historical data seed...');

    for (const symbol of SEED_CONFIG.symbols) {
      for (const interval of SEED_CONFIG.intervals) {
        try {
          const count = await this.klineRepository.countKlines(
            symbol,
            interval,
          );

          if (count >= SEED_CONFIG.seedLimit * 0.9) {
            this.logger.debug(
              `✅ ${symbol} ${interval}: already have ${count} klines, skipping`,
            );
            continue;
          }

          // Fetch the gap
          const latestOpenTime = await this.klineRepository.getLatestOpenTime(
            symbol,
            interval,
          );

          let startTime: number | undefined;
          if (latestOpenTime) {
            startTime = latestOpenTime + 1;
            this.logger.log(
              `📥 ${symbol} ${interval}: filling from ${new Date(latestOpenTime).toISOString()}`,
            );
          } else {
            this.logger.log(
              `📥 ${symbol} ${interval}: initial seed (${SEED_CONFIG.seedLimit} candles)`,
            );
          }

          const data = await this.fetchFromBinance(
            symbol,
            interval,
            startTime,
            undefined,
            SEED_CONFIG.seedLimit,
          );

          if (data.length > 0) {
            await this.storeKlines(symbol, interval, data);
            this.logger.log(
              `✅ ${symbol} ${interval}: seeded ${data.length} klines`,
            );
          }

          // Rate limit: be conservative
          await this.delay(200);
        } catch (error) {
          this.logger.warn(
            `⚠️ Failed to seed ${symbol} ${interval}: ${error.message}`,
          );
          await this.delay(500);
        }
      }
    }

    this.logger.log('🌱 Historical data seed completed');
  }

  async getSymbolInfo(symbol: string) {
    const normalizedSymbol = symbol.toUpperCase();
    const url = `${this.restBaseUrl}/api/v3/exchangeInfo?symbol=${normalizedSymbol}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new HttpException('Symbol not found', HttpStatus.NOT_FOUND);
      }
      return response.json();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Error fetching symbol info', error);
      throw new HttpException(
        'Failed to fetch symbol info',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
