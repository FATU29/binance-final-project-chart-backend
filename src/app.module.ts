import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { RedisModule } from './redis/redis.module';
import { QueuesModule } from './queues/queues.module';
import { BinanceModule } from './binance/binance.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AppConfigService } from './config/app-config.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    RedisModule,
    QueuesModule,
    BinanceModule,
    RealtimeModule,
  ],
  controllers: [AppController],
  providers: [AppConfigService],
})
export class AppModule {}
