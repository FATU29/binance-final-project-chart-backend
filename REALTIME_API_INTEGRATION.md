# Realtime WebSocket API Integration Guide

## Overview

This backend provides real-time cryptocurrency price updates via WebSocket using Socket.IO. The system streams live price data from Binance and broadcasts it to connected clients through a pub/sub pattern.

## Architecture

```
Binance WebSocket → Backend Service → Redis Queue → Price Processor → WebSocket Gateway → Frontend Clients
```

- **Technology**: Socket.IO (WebSocket with fallback support)
- **Protocol**: WebSocket
- **Namespace**: `/prices`
- **Port**: `3000` (default, configurable via `PORT` env variable)

---

## Connection Details

### WebSocket Endpoint

```
ws://localhost:3000/prices
```

For production, replace `localhost:3000` with your backend domain.

### CORS Configuration

The backend supports CORS and is configured via the `FRONTEND_URL` environment variable:
- **Development**: `http://localhost:3001`
- **Docker**: `*` (allow all origins)
- **Production**: Set to your frontend domain

---

## Client Setup

### Installation

```bash
npm install socket.io-client
# or
yarn add socket.io-client
```

### Basic Connection Example

```typescript
import { io, Socket } from 'socket.io-client';

const socket: Socket = io('ws://localhost:3000/prices', {
  transports: ['websocket', 'polling'], // WebSocket preferred, polling as fallback
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

// Connection events
socket.on('connect', () => {
  console.log('Connected to price stream:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});
```

---

## API Events

### 1. Subscribe to Symbol

Subscribe to receive real-time price updates for a specific cryptocurrency symbol.

**Event Name**: `subscribe`

**Payload**:
```typescript
{
  symbol: string; // Trading pair symbol (e.g., "BTCUSDT", "ETHUSDT")
}
```

**Example**:
```typescript
socket.emit('subscribe', { symbol: 'BTCUSDT' });
```

**Response**:
```typescript
{
  success: boolean;
  message: string; // "Subscribed to BTCUSDT"
}
// OR
{
  error: string; // "Symbol is required"
}
```

**Notes**:
- Symbol is case-insensitive (converted to uppercase internally)
- You can subscribe to multiple symbols by emitting multiple subscribe events
- Supported symbols: `BTCUSDT`, `ETHUSDT`, `BNBUSDT` (configurable via `BINANCE_STREAMS`)

---

### 2. Unsubscribe from Symbol

Stop receiving price updates for a specific symbol.

**Event Name**: `unsubscribe`

**Payload**:
```typescript
{
  symbol: string; // Trading pair symbol
}
```

**Example**:
```typescript
socket.emit('unsubscribe', { symbol: 'BTCUSDT' });
```

**Response**:
```typescript
{
  success: boolean;
  message: string; // "Unsubscribed from BTCUSDT"
}
// OR
{
  error: string; // "Symbol is required"
}
```

---

### 3. Receive Price Updates

Listen for real-time price updates for subscribed symbols.

**Event Name**: `priceUpdate`

**Payload Structure**:
```typescript
interface PriceUpdate {
  symbol: string;   // Trading pair (e.g., "BTCUSDT")
  price: string;    // Current price as string (e.g., "42350.50")
  ts: number;       // Timestamp in milliseconds (e.g., 1703520000000)
}
```

**Example**:
```typescript
socket.on('priceUpdate', (data: PriceUpdate) => {
  console.log(`${data.symbol}: $${data.price} at ${new Date(data.ts).toISOString()}`);
  // Update your UI with the new price
});
```

---

## Complete Integration Example

### React Hook (TypeScript)

```typescript
import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface PriceUpdate {
  symbol: string;
  price: string;
  ts: number;
}

export const usePriceStream = (symbol: string) => {
  const [price, setPrice] = useState<string>('0');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Initialize socket connection
    const socket = io('ws://localhost:3000/prices', {
      transports: ['websocket', 'polling'],
      reconnection: true,
    });

    socketRef.current = socket;

    // Connection handlers
    socket.on('connect', () => {
      console.log('Connected:', socket.id);
      setIsConnected(true);
      
      // Subscribe to symbol
      socket.emit('subscribe', { symbol });
    });

    socket.on('disconnect', () => {
      console.log('Disconnected');
      setIsConnected(false);
    });

    // Price update handler
    socket.on('priceUpdate', (data: PriceUpdate) => {
      if (data.symbol === symbol.toUpperCase()) {
        setPrice(data.price);
      }
    });

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.emit('unsubscribe', { symbol });
        socketRef.current.disconnect();
      }
    };
  }, [symbol]);

  return { price, isConnected };
};
```

### Usage in Component

```typescript
import React from 'react';
import { usePriceStream } from './hooks/usePriceStream';

const PriceDisplay: React.FC = () => {
  const { price, isConnected } = usePriceStream('BTCUSDT');

  return (
    <div>
      <h2>Bitcoin Price</h2>
      <p>Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}</p>
      <p>Price: ${parseFloat(price).toFixed(2)}</p>
    </div>
  );
};

export default PriceDisplay;
```

---

## Multi-Symbol Support

Subscribe to multiple symbols simultaneously:

```typescript
const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];

socket.on('connect', () => {
  symbols.forEach(symbol => {
    socket.emit('subscribe', { symbol });
  });
});

socket.on('priceUpdate', (data: PriceUpdate) => {
  console.log(`${data.symbol}: $${data.price}`);
  
  // Update state based on symbol
  switch (data.symbol) {
    case 'BTCUSDT':
      setBtcPrice(data.price);
      break;
    case 'ETHUSDT':
      setEthPrice(data.price);
      break;
    case 'BNBUSDT':
      setBnbPrice(data.price);
      break;
  }
});
```

---

## Error Handling

### Connection Errors

```typescript
socket.on('connect_error', (error) => {
  console.error('Connection failed:', error.message);
  // Show user notification or retry logic
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});
```

### Reconnection Handling

```typescript
socket.on('reconnect', (attemptNumber) => {
  console.log('Reconnected after', attemptNumber, 'attempts');
  
  // Re-subscribe to all symbols
  symbols.forEach(symbol => {
    socket.emit('subscribe', { symbol });
  });
});

socket.on('reconnect_failed', () => {
  console.error('Failed to reconnect');
  // Notify user or fallback to REST API
});
```

---

## Testing

### Test with Socket.IO Client

```typescript
const socket = io('ws://localhost:3000/prices');

socket.on('connect', () => {
  console.log('✅ Connected:', socket.id);
  
  socket.emit('subscribe', { symbol: 'BTCUSDT' }, (response) => {
    console.log('Subscribe response:', response);
  });
});

socket.on('priceUpdate', (data) => {
  console.log('📊 Price Update:', data);
});

// Disconnect after 10 seconds
setTimeout(() => {
  socket.emit('unsubscribe', { symbol: 'BTCUSDT' });
  socket.disconnect();
}, 10000);
```

### Health Check

Check if the backend is running:

```bash
curl http://localhost:3000/health
```

---

## Environment Variables

Backend configuration (`.env` file):

```bash
# Server Port
PORT=3000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Binance Streams
BINANCE_STREAMS=btcusdt@miniTicker,ethusdt@miniTicker,bnbusdt@miniTicker

# CORS - Frontend URL
FRONTEND_URL=http://localhost:3001

# Queue Name
PRICE_QUEUE_NAME=price
```

---

## Available Symbols

The backend streams the following symbols (configurable via `BINANCE_STREAMS`):

- `BTCUSDT` - Bitcoin / USDT
- `ETHUSDT` - Ethereum / USDT
- `BNBUSDT` - Binance Coin / USDT

To add more symbols, update the `BINANCE_STREAMS` environment variable:

```bash
BINANCE_STREAMS=btcusdt@miniTicker,ethusdt@miniTicker,solusdt@miniTicker,adausdt@miniTicker
```

---

## Data Flow

1. **Client connects** to `ws://localhost:3000/prices`
2. **Client subscribes** to symbol(s) via `subscribe` event
3. **Backend joins** client to symbol-specific room
4. **Binance streams** send price updates
5. **Backend processes** and broadcasts to room
6. **Client receives** `priceUpdate` events
7. **Client unsubscribes** when done
8. **Client disconnects** on cleanup

---

## Performance Considerations

- **Bandwidth**: Each price update is ~100-200 bytes
- **Frequency**: Updates arrive every 1-2 seconds per symbol
- **Multiple symbols**: Each symbol is independent; subscribing to 3 symbols = 3x updates
- **Reconnection**: Automatic with exponential backoff
- **Room-based broadcasting**: Only subscribed clients receive updates

---

## Troubleshooting

### Connection Issues

**Problem**: Cannot connect to WebSocket

**Solutions**:
1. Verify backend is running: `curl http://localhost:3000/health`
2. Check CORS settings in backend `.env`
3. Ensure port 3000 is not blocked by firewall
4. Try polling transport: `transports: ['polling', 'websocket']`

### No Price Updates

**Problem**: Connected but not receiving price updates

**Solutions**:
1. Verify you've subscribed: Check `subscribe` response
2. Check symbol is correct and uppercase
3. Verify symbol is in `BINANCE_STREAMS` config
4. Check browser console for errors
5. Confirm Redis is running and connected

### Stale Data

**Problem**: Receiving old or duplicate prices

**Solutions**:
1. Check timestamp `ts` field to verify freshness
2. Ensure only one socket connection per symbol
3. Clear state on disconnect/reconnect
4. Verify system clock is synchronized

---

## Security Best Practices

1. **Use WSS in production**: `wss://your-domain.com/prices`
2. **Validate origin**: Configure `FRONTEND_URL` to your domain
3. **Rate limiting**: Consider implementing client-side throttling
4. **Authentication**: Add JWT token validation if needed
5. **Input validation**: Backend validates all symbol inputs

---

## Migration from REST to WebSocket

If you're currently using REST API polling:

**Before (REST - Inefficient)**:
```typescript
// Polling every 2 seconds
setInterval(async () => {
  const response = await fetch('http://api.com/price/BTCUSDT');
  const data = await response.json();
  setPrice(data.price);
}, 2000);
```

**After (WebSocket - Efficient)**:
```typescript
socket.emit('subscribe', { symbol: 'BTCUSDT' });
socket.on('priceUpdate', (data) => setPrice(data.price));
```

**Benefits**:
- ⚡ Real-time updates (no polling delay)
- 📉 Reduced bandwidth (~90% less traffic)
- 🚀 Lower latency (instant updates)
- 💰 Lower server load

---

## Support

For issues or questions:
- Check backend logs for connection/subscription errors
- Verify environment variables are set correctly
- Test with minimal example first
- Use Socket.IO debug mode: `localStorage.debug = 'socket.io-client:socket'`

---

## API Summary

| Event | Direction | Purpose | Payload |
|-------|-----------|---------|---------|
| `subscribe` | Client → Server | Subscribe to symbol | `{ symbol: string }` |
| `unsubscribe` | Client → Server | Unsubscribe from symbol | `{ symbol: string }` |
| `priceUpdate` | Server → Client | Receive price update | `{ symbol, price, ts }` |
| `connect` | Server → Client | Connection established | - |
| `disconnect` | Server → Client | Connection closed | `reason: string` |

---

## Version

- **Backend Version**: 1.0.0
- **Socket.IO Version**: 4.6.1
- **Last Updated**: December 2025
