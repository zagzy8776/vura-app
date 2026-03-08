import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { PrismaService } from '../prisma.service';
import { LimitsModule } from '../limits/limits.module';
import { HoldsModule } from '../holds/holds.module';
import { PaystackService } from '../services/paystack.service';

@Module({
  imports: [LimitsModule, HoldsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, PrismaService, PaystackService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
