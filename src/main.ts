import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { AppConfigService } from './config/app-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  const appConfig = app.get(AppConfigService);
  const port = appConfig.port;

  // Enable CORS for REST endpoints
  app.enableCors({
    origin: appConfig.frontendUrl === '*' ? '*' : appConfig.frontendUrl,
    credentials: true,
  });

  await app.listen(port);
  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`WebSocket endpoint: ws://localhost:${port}/prices`);
  logger.log(`Health check: http://localhost:${port}/health`);
}

bootstrap();
