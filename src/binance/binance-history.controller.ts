import { Controller, Get, Query, HttpException, HttpStatus } from '@nestjs/common';
import { BinanceHistoryService } from './binance-history.service';
import { HistoricalDataQuery } from './binance.types';

@Controller('binance')
export class BinanceHistoryController {
  constructor(
    private readonly binanceHistoryService: BinanceHistoryService,
  ) {}

  /**
   * GET /binance/history
   * Fetch historical kline/candlestick data from Binance
   * 
   * Query parameters:
   * - symbol: Trading pair (e.g., BTCUSDT) - required
   * - interval: Kline interval (1m, 5m, 15m, 1h, 4h, 1d, 1w, 1M) - required
   * - startTime: Start timestamp in milliseconds - optional
   * - endTime: End timestamp in milliseconds - optional
   * - limit: Number of records to return (max 1000, default 500) - optional
   * 
   * Example: /binance/history?symbol=BTCUSDT&interval=1h&limit=100
   */
  @Get('history')
  async getHistoricalData(
    @Query('symbol') symbol: string,
    @Query('interval') interval: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('limit') limit?: string,
  ) {
    // Validate required parameters
    if (!symbol) {
      throw new HttpException(
        'Symbol parameter is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!interval) {
      throw new HttpException(
        'Interval parameter is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate interval format
    const validIntervals = [
      '1m', '3m', '5m', '15m', '30m',
      '1h', '2h', '4h', '6h', '8h', '12h',
      '1d', '3d', '1w', '1M',
    ];

    if (!validIntervals.includes(interval)) {
      throw new HttpException(
        `Invalid interval. Valid intervals: ${validIntervals.join(', ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Build query object
    const query: HistoricalDataQuery = {
      symbol,
      interval,
    };

    if (startTime) {
      const startTimeNum = parseInt(startTime, 10);
      if (isNaN(startTimeNum)) {
        throw new HttpException(
          'Invalid startTime parameter',
          HttpStatus.BAD_REQUEST,
        );
      }
      query.startTime = startTimeNum;
    }

    if (endTime) {
      const endTimeNum = parseInt(endTime, 10);
      if (isNaN(endTimeNum)) {
        throw new HttpException(
          'Invalid endTime parameter',
          HttpStatus.BAD_REQUEST,
        );
      }
      query.endTime = endTimeNum;
    }

    if (limit) {
      const limitNum = parseInt(limit, 10);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
        throw new HttpException(
          'Invalid limit parameter (must be between 1 and 1000)',
          HttpStatus.BAD_REQUEST,
        );
      }
      query.limit = limitNum;
    }

    try {
      const data = await this.binanceHistoryService.getHistoricalKlines(query);

      return {
        success: true,
        symbol: symbol.toUpperCase(),
        interval,
        count: data.length,
        data,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to fetch historical data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /binance/symbol/:symbol
   * Get exchange info for a specific symbol
   */
  @Get('symbol/:symbol')
  async getSymbolInfo(@Query('symbol') symbol: string) {
    if (!symbol) {
      throw new HttpException(
        'Symbol parameter is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.binanceHistoryService.getSymbolInfo(symbol);
  }
}
