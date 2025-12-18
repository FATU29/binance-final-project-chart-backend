import { IsString, IsNumber, IsOptional } from 'class-validator';

export class RedisConfig {
  @IsString()
  host: string;

  @IsNumber()
  port: number;

  @IsString()
  @IsOptional()
  password?: string;
}
