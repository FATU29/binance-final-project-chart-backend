import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type KlineDocument = Kline & Document;

@Schema({
  collection: 'klines',
  timestamps: false,
  // Optimize for time-series read patterns
  autoIndex: true,
})
export class Kline {
  @Prop({ required: true, index: true })
  symbol: string;

  @Prop({ required: true, index: true })
  interval: string;

  @Prop({ required: true })
  openTime: number;

  @Prop({ required: true })
  closeTime: number;

  @Prop({ required: true })
  open: string;

  @Prop({ required: true })
  high: string;

  @Prop({ required: true })
  low: string;

  @Prop({ required: true })
  close: string;

  @Prop({ required: true })
  volume: string;

  @Prop({ default: '0' })
  quoteVolume: string;

  @Prop({ default: 0 })
  trades: number;

  @Prop({ default: '0' })
  takerBuyBaseVolume: string;

  @Prop({ default: '0' })
  takerBuyQuoteVolume: string;

  @Prop({ default: false })
  isClosed: boolean;
}

export const KlineSchema = SchemaFactory.createForClass(Kline);

// Compound unique index: one candle per (symbol, interval, openTime)
KlineSchema.index({ symbol: 1, interval: 1, openTime: 1 }, { unique: true });

// Query index: fetch candles by symbol+interval sorted by time
KlineSchema.index({ symbol: 1, interval: 1, openTime: -1 });
