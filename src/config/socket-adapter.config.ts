// Socket.IO Redis Adapter Configuration for Multi-Pod WebSocket Scaling
// Place this file in: binance-final-project-chart-backend/src/config/socket-adapter.config.ts

import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { INestApplicationContext, Logger } from '@nestjs/common';

/**
 * Custom Socket.IO adapter with Redis backend for horizontal scaling
 *
 * Features:
 * - Multi-pod broadcasting using Redis Pub/Sub
 * - Automatic reconnection with exponential backoff
 * - WebSocket-only transport for lower overhead
 * - Optimized for 1000+ concurrent connections
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;
  private readonly logger = new Logger(RedisIoAdapter.name);

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
    const redisPassword = process.env.REDIS_PASSWORD;

    // Build Redis URL with optional password
    let redisUrl = `redis://${redisHost}:${redisPort}`;
    if (redisPassword) {
      redisUrl = `redis://:${redisPassword}@${redisHost}:${redisPort}`;
    }

    this.logger.log(
      `Connecting to Redis at ${redisHost}:${redisPort} for Socket.IO adapter...`,
    );

    // Create two Redis clients for pub/sub pattern
    const pubClient = createClient({
      url: redisUrl,
      socket: {
        // Reconnection strategy with exponential backoff
        reconnectStrategy: (retries) => {
          const delay = Math.min(retries * 100, 3000);
          this.logger.warn(
            `Redis pub client reconnecting (attempt ${retries}), delay: ${delay}ms`,
          );
          return delay;
        },
      },
    });

    const subClient = pubClient.duplicate();

    // Error handlers
    pubClient.on('error', (err) => {
      this.logger.error('Redis pub client error', err);
    });

    subClient.on('error', (err) => {
      this.logger.error('Redis sub client error', err);
    });

    // Connection success
    pubClient.on('connect', () => {
      this.logger.log('Redis pub client connected');
    });

    subClient.on('connect', () => {
      this.logger.log('Redis sub client connected');
    });

    // Connect both clients
    await Promise.all([pubClient.connect(), subClient.connect()]);

    this.logger.log('✅ Redis clients connected successfully');

    // Create the adapter
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    // Optimized Socket.IO options for high concurrency & low latency
    const serverOptions: ServerOptions = {
      ...options,
      // WebSocket-only: skip HTTP long-polling for lower latency
      transports: ['websocket'],
      // Tuned keep-alive: detect dead connections faster
      pingInterval: 15000, // 15 seconds
      pingTimeout: 10000, // 10 seconds
      maxHttpBufferSize: 512 * 1024, // 512KB max payload (price data is small)
      perMessageDeflate: false, // Disable compression for lower CPU
      // Disable HTTP upgrade timeout for faster connections
      upgradeTimeout: 5000,
      // Allow binary data for efficiency
      allowEIO3: false,

      // CORS configuration
      cors: {
        origin: '*',
        credentials: false,
        methods: ['GET', 'POST'],
      },
    };

    const server = super.createIOServer(port, serverOptions);

    // Attach Redis adapter
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
      this.logger.log('✅ Redis adapter attached to Socket.IO server');
    } else {
      this.logger.warn(
        '⚠️  Redis adapter not initialized, using in-memory adapter (not suitable for production!)',
      );
    }

    // Server-level event listeners
    server.on('connection', (socket) => {
      this.logger.debug(
        `Client connected: ${socket.id} from ${socket.handshake.address}`,
      );
    });

    server.on('connection_error', (err) => {
      this.logger.error('Connection error:', err);
    });

    // Metrics for monitoring
    const interval = setInterval(() => {
      const socketsCount = server.engine.clientsCount;
      this.logger.log(`📊 Active connections: ${socketsCount}`);
    }, 60000); // Log every minute

    server.on('close', () => {
      clearInterval(interval);
      this.logger.log('Socket.IO server closed');
    });

    return server;
  }
}

/**
 * Usage in main.ts:
 *
 * import { RedisIoAdapter } from './config/socket-adapter.config';
 *
 * async function bootstrap() {
 *   const app = await NestFactory.create(AppModule);
 *
 *   const redisIoAdapter = new RedisIoAdapter(app);
 *   await redisIoAdapter.connectToRedis();
 *   app.useWebSocketAdapter(redisIoAdapter);
 *
 *   await app.listen(3000);
 * }
 */
