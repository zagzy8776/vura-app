import { Module } from '@nestjs/common';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';
import { PrismaService } from '../prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { LimitsService } from '../limits/limits.service';
import { HoldsService } from '../holds/holds.service';
import { PaystackService } from '../services/paystack.service';
import { MonnifyService } from '../services/monnify.service';
import { FlutterwaveService } from '../services/flutterwave.service';

@Module({
  controllers: [BillsController],
  providers: [
    BillsService,
    PrismaService,
    TransactionsService,
    LimitsService,
    HoldsService,
    PaystackService,
    MonnifyService,
    FlutterwaveService,
  ],
  exports: [BillsService],
})
export class BillsModule {}
