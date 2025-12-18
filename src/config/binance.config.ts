import { IsString } from 'class-validator';

export class BinanceConfig {
  @IsString()
  spotWsBase: string;

  @IsString()
  spotRestBase: string;

  @IsString()
  streams: string;
}
