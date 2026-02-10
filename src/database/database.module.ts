import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Kline, KlineSchema } from './schemas/kline.schema';
import { KlineRepository } from './kline.repository';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Kline.name, schema: KlineSchema }]),
  ],
  providers: [KlineRepository],
  exports: [KlineRepository, MongooseModule],
})
export class DatabaseModule {}
