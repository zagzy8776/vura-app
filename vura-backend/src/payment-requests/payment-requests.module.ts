import { Module } from '@nestjs/common';
import { PaymentRequestsService } from './payment-requests.service';
import { PaymentRequestsController } from './payment-requests.controller';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [PaymentRequestsService, PrismaService],
  controllers: [PaymentRequestsController],
  exports: [PaymentRequestsService],
})
export class PaymentRequestsModule {}
