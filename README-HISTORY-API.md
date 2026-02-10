# Binance Historical Data API

This document describes the historical kline/candlestick data API that fetches data from Binance.

## Backend API Endpoint

### GET `/binance/history`

Fetches historical candlestick (kline) data from Binance API.

#### Query Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `symbol` | string | Yes | Trading pair symbol | `BTCUSDT` |
| `interval` | string | Yes | Kline interval | `1h`, `5m`, `1d` |
| `startTime` | number | No | Start timestamp (milliseconds) | `1770681600000` |
| `endTime` | number | No | End timestamp (milliseconds) | `1770685199999` |
| `limit` | number | No | Number of records (max 1000, default 500) | `100` |

#### Valid Intervals

- `1m`, `3m`, `5m`, `15m`, `30m`
- `1h`, `2h`, `4h`, `6h`, `8h`, `12h`
- `1d`, `3d`, `1w`, `1M`

#### Response Format

```json
{
  "success": true,
  "symbol": "BTCUSDT",
  "interval": "1h",
  "count": 5,
  "data": [
    {
      "openTime": 1770681600000,
      "open": "70138.00000000",
      "high": "70255.36000000",
      "low": "69743.80000000",
      "close": "69827.33000000",
      "volume": "569.13678000",
      "closeTime": 1770685199999,
      "quoteVolume": "39810350.51404060",
      "trades": 136081,
      "takerBuyBaseVolume": "236.86140000",
      "takerBuyQuoteVolume": "16569442.19976390"
    }
  ]
}
```

#### Example Requests

```bash
# Get last 100 hours of BTC data
curl "http://localhost:3001/binance/history?symbol=BTCUSDT&interval=1h&limit=100"

# Get last 30 days of ETH data
curl "http://localhost:3001/binance/history?symbol=ETHUSDT&interval=1d&limit=30"

# Get 5-minute candles
curl "http://localhost:3001/binance/history?symbol=BNBUSDT&interval=5m&limit=50"
```

## Frontend Implementation

### Installation

The history API is already set up in the frontend. Import the hook:

```typescript
import { useBinanceHistory } from '@/hooks';
```

### Basic Usage

```typescript
import { useBinanceHistory } from '@/hooks';

export function MyComponent() {
  const { data, candlestickData, loading, error, fetchData } = useBinanceHistory();

  const loadHistory = async () => {
    await fetchData({
      symbol: 'BTCUSDT',
      interval: '1h',
      limit: 100
    });
  };

  return (
    <div>
      <button onClick={loadHistory} disabled={loading}>
        {loading ? 'Loading...' : 'Fetch History'}
      </button>
      
      {error && <div>Error: {error.message}</div>}
      
      {data && (
        <div>
          Loaded {data.length} candles
          {data.map((candle) => (
            <div key={candle.openTime}>
              {candle.close} at {new Date(candle.openTime).toLocaleString()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Auto-Fetch on Mount

```typescript
import { useAutoFetchHistory } from '@/hooks';

export function ChartComponent() {
  const { data, loading, error } = useAutoFetchHistory({
    symbol: 'BTCUSDT',
    interval: '1h',
    limit: 200
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {/* Use data for your chart */}
      {candlestickData && <MyChart data={candlestickData} />}
    </div>
  );
}
```

### Using with Chart Libraries

The hook provides `candlestickData` with numeric values ready for chart libraries:

```typescript
const { candlestickData } = useBinanceHistory();

// candlestickData format:
// [
//   {
//     time: 1770681600000,
//     open: 70138.00,
//     high: 70255.36,
//     low: 69743.80,
//     close: 69827.33,
//     volume: 569.14
//   },
//   ...
// ]

// Use with Lightweight Charts
<LightweightChart data={candlestickData} />

// Use with Chart.js
<ChartJS data={{
  datasets: [{
    data: candlestickData.map(d => ({
      x: d.time,
      y: [d.open, d.high, d.low, d.close]
    }))
  }]
}} />
```

### API Service

You can also use the API service directly:

```typescript
import { fetchHistoricalKlines, fetchCandlestickData } from '@/lib/api/binance-history';

// Fetch raw data
const response = await fetchHistoricalKlines({
  symbol: 'BTCUSDT',
  interval: '1h',
  limit: 100
});

// Fetch with automatic conversion to numbers
const candledata = await fetchCandlestickData({
  symbol: 'BTCUSDT',
  interval: '1h',
  limit: 100
});
```

## Example Component

See `/fe/components/examples/BinanceHistoryExample.tsx` for a complete working example with:
- Form controls for symbol, interval, and limit
- Data fetching and loading states
- Error handling
- Data visualization with tables
- Summary statistics

## Architecture

### Backend Flow

1. **Controller** (`binance-history.controller.ts`) - Handles HTTP requests
2. **Service** (`binance-history.service.ts`) - Fetches data from Binance API
3. **Types** (`binance.types.ts`) - TypeScript definitions

### Frontend Flow

1. **Hook** (`use-binance-history.ts`) - React hook for state management
2. **API Service** (`lib/api/binance-history.ts`) - HTTP client
3. **Types** (`types/binance-history.ts`) - TypeScript definitions

## Error Handling

The API handles various error cases:

- **400 Bad Request**: Invalid parameters (missing symbol/interval, invalid interval value, invalid limit)
- **404 Not Found**: Symbol not found on Binance
- **429 Too Many Requests**: Rate limit exceeded
- **502 Bad Gateway**: Binance API is unavailable

All errors are properly propagated to the frontend with descriptive messages.

## Testing

Test the API with curl:

```bash
# Valid request
curl "http://localhost:3001/binance/history?symbol=BTCUSDT&interval=1h&limit=5"

# Invalid symbol
curl "http://localhost:3001/binance/history?symbol=INVALID&interval=1h&limit=5"

# Invalid interval
curl "http://localhost:3001/binance/history?symbol=BTCUSDT&interval=invalid&limit=5"

# Missing required params
curl "http://localhost:3001/binance/history?symbol=BTCUSDT"
```

## Performance Considerations

- **Caching**: Consider implementing Redis caching for frequently requested data
- **Rate Limiting**: Binance has rate limits - be mindful when making frequent requests
- **Data Size**: Limit parameter is capped at 1000 to prevent excessive data transfer
- **Pagination**: For large datasets, use `startTime`/`endTime` parameters to paginate

## Future Enhancements

- [ ] Add caching layer (Redis)
- [ ] Implement request rate limiting
- [ ] Add WebSocket streaming for real-time updates
- [ ] Support for more exchanges
- [ ] Add data aggregation endpoints
- [ ] Implement data persistence for historical analysis
