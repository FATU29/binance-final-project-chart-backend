// Mini-ticker stream payload
export interface BinanceMiniTickerPayload {
  e: '24hrMiniTicker'; // Event type
  E: number; // Event time
  s: string; // Symbol
  c: string; // Close price
  o: string; // Open price
  h: string; // High price
  l: string; // Low price
  v: string; // Total traded base asset volume
  q: string; // Total traded quote asset volume
}

// Trade stream payload
export interface BinanceTradePayload {
  e: 'trade'; // Event type
  E: number; // Event time
  s: string; // Symbol
  t: number; // Trade ID
  p: string; // Price
  q: string; // Quantity
  b: number; // Buyer order ID
  a: number; // Seller order ID
  T: number; // Trade time
  m: boolean; // Is buyer the market maker?
  M: boolean; // Ignore
}

// Kline stream payload
export interface BinanceKlinePayload {
  e: 'kline'; // Event type
  E: number; // Event time
  s: string; // Symbol
  k: {
    t: number; // Kline start time
    T: number; // Kline close time
    s: string; // Symbol
    i: string; // Interval
    f: number; // First trade ID
    L: number; // Last trade ID
    o: string; // Open price
    c: string; // Close price
    h: string; // High price
    l: string; // Low price
    v: string; // Base asset volume
    n: number; // Number of trades
    x: boolean; // Is this kline closed?
    q: string; // Quote asset volume
    V: string; // Taker buy base asset volume
    Q: string; // Taker buy quote asset volume
    B: string; // Ignore
  };
}

// Combined stream message wrapper
export interface BinanceCombinedStreamMessage {
  stream: string;
  data: BinanceMiniTickerPayload | BinanceTradePayload | BinanceKlinePayload;
}

// Normalized price data for internal use
export interface PriceData {
  symbol: string;
  price: string;
  ts: number;
  raw: any;
}
