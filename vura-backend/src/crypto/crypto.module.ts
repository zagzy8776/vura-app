import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CryptoController } from './crypto.controller';
import { CoinGeckoService } from './coingecko.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [CryptoController],
  providers: [CoinGeckoService, PrismaService],
  exports: [CoinGeckoService],
})
export class CryptoModule {}
