import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Kline, KlineDocument } from './schemas/kline.schema';

@Injectable()
export class KlineRepository {
  private readonly logger = new Logger(KlineRepository.name);

  constructor(
    @InjectModel(Kline.name) private readonly klineModel: Model<KlineDocument>,
  ) {}

  /**
   * Upsert a single kline (insert or update if exists)
   */
  async upsertKline(data: Partial<Kline>): Promise<void> {
    await this.klineModel.updateOne(
      {
        symbol: data.symbol,
        interval: data.interval,
        openTime: data.openTime,
      },
      { $set: data },
      { upsert: true },
    );
  }

  /**
   * Bulk upsert klines — efficient for seeding history
   */
  async bulkUpsertKlines(klines: Partial<Kline>[]): Promise<number> {
    if (klines.length === 0) return 0;

    const ops = klines.map((k) => ({
      updateOne: {
        filter: {
          symbol: k.symbol,
          interval: k.interval,
          openTime: k.openTime,
        },
        update: { $set: k },
        upsert: true,
      },
    }));

    const result = await this.klineModel.bulkWrite(ops, { ordered: false });
    return result.upsertedCount + result.modifiedCount;
  }

  /**
   * Query klines by symbol, interval, and optional time range.
   * When a time range (startTime/endTime) is provided, returns oldest-first
   * within that range. When NO time range is given, returns the most recent
   * `limit` klines in ascending order (so the chart always shows current data).
   */
  async findKlines(
    symbol: string,
    interval: string,
    startTime?: number,
    endTime?: number,
    limit = 1000,
  ): Promise<KlineDocument[]> {
    const filter: any = {
      symbol: symbol.toUpperCase(),
      interval,
    };

    const hasTimeRange = !!(startTime || endTime);

    if (hasTimeRange) {
      filter.openTime = {};
      if (startTime) filter.openTime.$gte = startTime;
      if (endTime) filter.openTime.$lte = endTime;
    }

    if (hasTimeRange) {
      // When a time range is specified (e.g. lazy-load older candles),
      // return oldest-first within the range.
      return this.klineModel
        .find(filter)
        .sort({ openTime: 1 })
        .limit(limit)
        .lean()
        .exec();
    }

    // No time range → return the MOST RECENT klines.
    // Sort descending to pick the latest `limit` rows, then reverse
    // so the caller gets chronological (ascending) order.
    const results = await this.klineModel
      .find(filter)
      .sort({ openTime: -1 })
      .limit(limit)
      .lean()
      .exec();

    return results.reverse();
  }

  /**
   * Get the latest kline openTime stored for a symbol+interval
   */
  async getLatestOpenTime(
    symbol: string,
    interval: string,
  ): Promise<number | null> {
    const latest = await this.klineModel
      .findOne({ symbol: symbol.toUpperCase(), interval })
      .sort({ openTime: -1 })
      .select('openTime')
      .lean()
      .exec();

    return latest ? latest.openTime : null;
  }

  /**
   * Get the earliest kline openTime stored for a symbol+interval
   */
  async getEarliestOpenTime(
    symbol: string,
    interval: string,
  ): Promise<number | null> {
    const earliest = await this.klineModel
      .findOne({ symbol: symbol.toUpperCase(), interval })
      .sort({ openTime: 1 })
      .select('openTime')
      .lean()
      .exec();

    return earliest ? earliest.openTime : null;
  }

  /**
   * Count klines for a symbol+interval
   */
  async countKlines(symbol: string, interval: string): Promise<number> {
    return this.klineModel.countDocuments({
      symbol: symbol.toUpperCase(),
      interval,
    });
  }
}
