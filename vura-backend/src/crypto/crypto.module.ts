import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CryptoController } from './crypto.controller';
import { WebhookController } from './webhook.controller';
import { BushaService } from './busha.service';
import { YellowCardService } from './yellowcard.service';
import { CoinGeckoService } from './coingecko.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [CryptoController, WebhookController],
  providers: [BushaService, YellowCardService, CoinGeckoService, PrismaService],
  exports: [BushaService, YellowCardService, CoinGeckoService],
})
export class CryptoModule {}
