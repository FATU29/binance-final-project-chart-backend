import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { RedisModule } from './redis/redis.module';
import { QueuesModule } from './queues/queues.module';
import { BinanceModule } from './binance/binance.module';
import { RealtimeModule } from './realtime/realtime.module';
import { DatabaseModule } from './database/database.module';
import { AppConfigService } from './config/app-config.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>(
          'MONGODB_URI',
          'mongodb://localhost:27017/chart_db',
        ),
      }),
      inject: [ConfigService],
    }),
    RedisModule,
    DatabaseModule,
    QueuesModule,
    BinanceModule,
    RealtimeModule,
  ],
  controllers: [AppController],
  providers: [AppConfigService],
})
export class AppModule {}
