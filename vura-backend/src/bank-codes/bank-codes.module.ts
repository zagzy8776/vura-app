import { Module } from '@nestjs/common';
import { BankCodesController } from './bank-codes.controller';
import { BankCodesService } from '../services/bank-codes.service';
import { PaystackService } from '../services/paystack.service';
import { KorapayService } from '../services/korapay.service';

@Module({
  controllers: [BankCodesController],
  providers: [BankCodesService, PaystackService, KorapayService],
  exports: [BankCodesService],
})
export class BankCodesModule {}
