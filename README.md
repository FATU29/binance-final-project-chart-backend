# Binance Price Stream Backend

NestJS backend for real-time cryptocurrency price streaming from Binance with Redis Pub/Sub and BullMQ integration.

## Features

- 🔄 **Real-time Binance WebSocket**: Connect to Binance market data streams
- 📡 **Redis Pub/Sub**: Internal message broadcasting between services
- 📋 **BullMQ**: Background job processing for price persistence, analytics, and alerts
- 🔌 **Socket.IO Gateway**: WebSocket endpoint for frontend clients
- 🏥 **Health Check**: Monitor service status and connections

## Architecture

```
Binance WebSocket → BinanceStreamService → Redis Pub/Sub + BullMQ Queue
                                              ↓                ↓
                                    RedisSubscriber    PriceProcessor
                                              ↓                ↓
                                     PriceGateway      Background Jobs
                                              ↓
                                    Next.js Clients
```

## Tech Stack

- **NestJS** v10+
- **Redis** (Pub/Sub + BullMQ)
- **BullMQ** for job queues
- **Socket.IO** for WebSocket
- **Binance API** (WebSocket market data)
- **ioredis** for Redis client
- **TypeScript**

## Prerequisites

- Node.js 18+ and npm
- Redis 6+ running locally or remotely
- (Optional) Docker for running Redis

## Installation

### For Docker (Recommended)

1. **Setup environment variables**

```bash
# Use Docker-specific environment file
cp .env.docker .env
```

2. **Start the application**

```bash
docker-compose up -d
```

That's it! The application will run on http://localhost:3000

### For Local Development

1. **Install dependencies**

```bash
npm install
```

2. **Setup environment variables**

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env`:

```env
NODE_ENV=development
PORT=3000

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Binance
BINANCE_SPOT_WS_BASE=wss://stream.binance.com:9443
BINANCE_SPOT_REST_BASE=https://api.binance.com
BINANCE_STREAMS=btcusdt@miniTicker,ethusdt@miniTicker

# Queue
PRICE_QUEUE_NAME=price

# Frontend CORS
FRONTEND_URL=http://localhost:3001
```

4. **Start Redis** (if using Docker)

```bash
docker-compose up -d
```

Or install Redis locally:

- Windows: https://redis.io/docs/getting-started/installation/install-redis-on-windows/
- Mac: `brew install redis && brew services start redis`
- Linux: `sudo apt-get install redis-server && sudo service redis-server start`

## Running the Application

### Option 1: Using Docker (Recommended)

The easiest way to run the entire stack (app + Redis):

1. **Setup environment file for Docker:**

```bash
# Copy the Docker environment template
cp .env.docker .env

# Or manually create .env with Docker-specific values
# IMPORTANT: Set REDIS_HOST=redis (not localhost)
```

2. **Build and start all services:**

```bash
docker-compose up -d
```

3. **View logs:**

```bash
docker-compose logs -f
```

4. **Stop all services:**

```bash
docker-compose down
```

5. **Rebuild after code changes:**

```bash
docker-compose up -d --build
```

The application will be available at:

- **API**: http://localhost:3000
- **WebSocket**: ws://localhost:3000/prices
- **Health Check**: http://localhost:3000/health

### Option 2: Local Development Mode

If you want to run the app locally (requires Redis running separately):

1. **Start Redis:**

```bash
docker-compose up redis -d
# Or use local Redis installation
```

2. **Install dependencies:**

```bash
npm install
```

3. **Create .env file for local development:**

```bash
cp .env.example .env
# Make sure REDIS_HOST=localhost (not 'redis')
```

4. **Run in development mode:**

```bash
npm run start:dev
```

### Option 3: Production Mode (Local)

```bash
npm run build
npm run start:prod
```

### Debug Mode

```bash
npm run start:debug
```

## API Endpoints

### Health Check

```
GET http://localhost:3000/health
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2025-12-17T10:00:00.000Z",
  "binance": {
    "connected": true
  }
}
```

## WebSocket Connection (Frontend)

### Connect to Socket.IO

```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3000/prices', {
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('Connected to price stream');
});

// Subscribe to BTCUSDT
socket.emit('subscribe', { symbol: 'BTCUSDT' });

// Listen for price updates
socket.on('priceUpdate', (data) => {
  console.log('Price update:', data);
  // { symbol: 'BTCUSDT', price: '42000.50', ts: 1702800000000 }
});

// Unsubscribe
socket.emit('unsubscribe', { symbol: 'BTCUSDT' });
```

## Project Structure

```
src/
├── app.module.ts              # Root module
├── app.controller.ts          # Health check endpoint
├── main.ts                    # Application entry point
├── config/
│   ├── redis.config.ts        # Redis configuration
│   ├── binance.config.ts      # Binance configuration
│   └── app-config.service.ts  # Centralized config service
├── redis/
│   ├── redis.module.ts        # Global Redis module
│   └── redis.service.ts       # Redis Pub/Sub clients
├── queues/
│   ├── queues.module.ts       # BullMQ root module
│   └── price/
│       ├── price-queue.module.ts
│       ├── price-queue.service.ts
│       ├── price.processor.ts    # Background job processor
│       └── price-job.interface.ts
├── binance/
│   ├── binance.module.ts
│   ├── binance-stream.service.ts  # WebSocket connection
│   └── binance.types.ts           # Type definitions
└── realtime/
    ├── realtime.module.ts
    ├── price.gateway.ts           # Socket.IO gateway
    └── redis-subscriber.service.ts # Redis channel subscriber
```

## Data Flow

1. **BinanceStreamService** connects to Binance WebSocket and receives price updates
2. For each price update:
   - Publishes to Redis channel `prices:<SYMBOL>`
   - Adds job to BullMQ queue `price`
3. **RedisSubscriberService** subscribes to `prices:*` pattern
4. When Redis message arrives, calls **PriceGateway.broadcastPrice()**
5. **PriceGateway** emits `priceUpdate` event to all clients in the symbol room
6. **PriceProcessor** handles background jobs (persist to DB, analytics, alerts)

## Binance Streams Configuration

The `BINANCE_STREAMS` environment variable accepts comma-separated stream names:

### Available Streams

- **Mini-ticker**: `<symbol>@miniTicker` (24hr stats, updated every second)
- **Trade**: `<symbol>@trade` (individual trades)
- **Kline**: `<symbol>@kline_<interval>` (candlestick data, e.g., `1m`, `5m`, `1h`)

### Examples

```env
# Single stream
BINANCE_STREAMS=btcusdt@miniTicker

# Multiple symbols
BINANCE_STREAMS=btcusdt@miniTicker,ethusdt@miniTicker,bnbusdt@miniTicker

# Mixed streams
BINANCE_STREAMS=btcusdt@trade,ethusdt@kline_1m,bnbusdt@miniTicker
```

## Extending the Project

### Add Database Persistence

Modify [src/queues/price/price.processor.ts](src/queues/price/price.processor.ts):

```typescript
private async handlePersistPrice(data: PriceJobData): Promise<void> {
  // Save to MongoDB, PostgreSQL, etc.
  await this.priceRepository.save({
    symbol: data.symbol,
    price: parseFloat(data.price),
    timestamp: new Date(data.ts),
  });
}
```

### Add Price Alerts

```typescript
private async checkAlerts(symbol: string, price: string): Promise<void> {
  const alerts = await this.alertRepository.findActiveAlerts(symbol);
  for (const alert of alerts) {
    if (parseFloat(price) >= alert.targetPrice) {
      await this.notificationService.sendAlert(alert);
    }
  }
}
```

## Testing

### Unit Tests

```bash
npm run test
```

### E2E Tests

```bash
npm run test:e2e
```

### Manual Testing

1. Start Redis and the application
2. Check health endpoint: `curl http://localhost:3000/health`
3. Use a WebSocket client tool (e.g., Postman, websocat) to connect to `ws://localhost:3000/prices`
4. Send subscribe event: `{"event": "subscribe", "data": {"symbol": "BTCUSDT"}}`
5. Watch for `priceUpdate` events

## Docker Commands Reference

### Build and Run

```bash
# Build and start in detached mode
docker-compose up -d

# Build with no cache
docker-compose build --no-cache

# Start only specific service
docker-compose up redis -d
docker-compose up app -d
```

### Logs and Monitoring

```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f app
docker-compose logs -f redis

# Check service status
docker-compose ps
```

### Managing Services

```bash
# Stop all services
docker-compose stop

# Start stopped services
docker-compose start

# Restart services
docker-compose restart

# Remove all containers (keeps volumes)
docker-compose down

# Remove containers and volumes
docker-compose down -v
```

### Debugging

```bash
# Execute command in running container
docker-compose exec app sh

# View app health
curl http://localhost:3000/health

# Check Redis connection
docker-compose exec redis redis-cli ping
```

## Production Deployment

### Using Docker Compose (Recommended)

1. **Update environment variables** in docker-compose.yml:
   - Set `REDIS_PASSWORD` for security
   - Set `FRONTEND_URL` to your frontend domain
   - Configure `BINANCE_STREAMS` as needed

2. **Deploy:**

```bash
docker-compose -f docker-compose.yml up -d
```

### Using Docker Only

```bash
# Build image
docker build -t binance-price-stream:latest .

# Run container
docker run -d \
  --name binance-app \
  -p 3000:3000 \
  -e REDIS_HOST=your-redis-host \
  -e REDIS_PORT=6379 \
  -e REDIS_PASSWORD=your-password \
  -e BINANCE_STREAMS=btcusdt@miniTicker,ethusdt@miniTicker \
  binance-price-stream:latest
```

### Using PM2 (Without Docker)

```bash
npm run build

npm install -g pm2
pm2 start dist/main.js --name binance-backend
pm2 save
pm2 startup
```

### Environment Variables for Production

Ensure production values for:

- `REDIS_HOST`: Redis server hostname
- `REDIS_PORT`: Redis port (default 6379)
- `REDIS_PASSWORD`: Strong password for Redis
- `FRONTEND_URL`: Your frontend domain (not `*`)
- `NODE_ENV=production`
- `BINANCE_STREAMS`: Only subscribe to symbols you need

## Troubleshooting

### Binance WebSocket Connection Issues

- Check firewall/proxy settings
- Verify `BINANCE_SPOT_WS_BASE` URL
- Check Binance API status: https://www.binance.com/en/support

### Redis Connection Failed

- Ensure Redis is running: `redis-cli ping` should return `PONG`
- Check `REDIS_HOST` and `REDIS_PORT`
- Verify password if required

### No Price Updates in Frontend

- Check WebSocket connection in browser DevTools
- Verify you've sent `subscribe` event with correct symbol
- Check backend logs for errors

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
