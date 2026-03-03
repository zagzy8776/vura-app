import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IvoryPayService } from './ivorypay.service';
import { IvoryPayController } from './ivorypay.controller';
import { IvoryPayWebhookController } from './ivorypay-webhook.controller';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [IvoryPayController, IvoryPayWebhookController],
  providers: [IvoryPayService, PrismaService],
  exports: [IvoryPayService],
})
export class IvoryPayModule {}
