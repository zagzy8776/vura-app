import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CryptoController } from './crypto.controller';
import { WebhookController } from './webhook.controller';
import { BushaService } from './busha.service';
import { YellowCardService } from './yellowcard.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [CryptoController, WebhookController],
  providers: [BushaService, YellowCardService, PrismaService],
  exports: [BushaService, YellowCardService],
})
export class CryptoModule {}
