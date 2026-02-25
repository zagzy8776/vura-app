import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CryptoController } from './crypto.controller';
import { WebhookController } from './webhook.controller';
import { YellowCardService } from './yellowcard.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [CryptoController, WebhookController],
  providers: [YellowCardService, PrismaService],
  exports: [YellowCardService],
})
export class CryptoModule {}
