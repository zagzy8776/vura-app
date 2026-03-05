import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IvoryPayService } from './ivorypay.service';
import { IvoryPayController } from './ivorypay.controller';
import { IvoryPayWebhookController } from './ivorypay-webhook.controller';
import { PrismaService } from '../prisma.service';
import { CryptoModule } from '../crypto/crypto.module';
import { FlutterwaveService } from '../services/flutterwave.service';

@Module({
  imports: [ConfigModule, CryptoModule],
  controllers: [IvoryPayController, IvoryPayWebhookController],
  providers: [IvoryPayService, PrismaService, FlutterwaveService],
  exports: [IvoryPayService],
})
export class IvoryPayModule {}
