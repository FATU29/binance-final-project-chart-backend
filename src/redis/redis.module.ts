import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';
import { AppConfigService } from '../config/app-config.service';

@Global()
@Module({
  providers: [RedisService, AppConfigService],
  exports: [RedisService],
})
export class RedisModule {}
