import { Module } from '@nestjs/common';
import { PaymentRequestsService } from './payment-requests.service';
import { PaymentRequestsController } from './payment-requests.controller';
import { PrismaService } from '../prisma.service';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [TransactionsModule],
  providers: [PaymentRequestsService, PrismaService],
  controllers: [PaymentRequestsController],
  exports: [PaymentRequestsService],
})
export class PaymentRequestsModule {}
