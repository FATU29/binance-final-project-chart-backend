import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { AppConfigService } from './config/app-config.service';
import { RedisIoAdapter } from './config/socket-adapter.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  const appConfig = app.get(AppConfigService);
  const port = appConfig.port;

  // Enable CORS for REST endpoints
  app.enableCors({
    origin: '*',
    credentials: false,
  });

  // Setup Redis Socket.IO adapter for multi-pod scaling
  // This enables cross-pod WebSocket message broadcasting
  try {
    const redisIoAdapter = new RedisIoAdapter(app);
    await redisIoAdapter.connectToRedis();
    app.useWebSocketAdapter(redisIoAdapter);
    logger.log('✅ Redis Socket.IO adapter initialized for horizontal scaling');
  } catch (error) {
    logger.error(
      '⚠️  Failed to initialize Redis Socket.IO adapter. Using in-memory adapter (not suitable for production scaling!)',
      error,
    );
    logger.warn(
      '⚠️  WebSocket will only work within single pod. For multi-pod scaling, ensure Redis is accessible.',
    );
  }

  await app.listen(port);
  logger.log(`🚀 Application is running on: http://localhost:${port}`);
  logger.log(`🔌 WebSocket endpoint: ws://localhost:${port}/prices`);
  logger.log(`🏥 Health check: http://localhost:${port}/health`);
}

bootstrap();
