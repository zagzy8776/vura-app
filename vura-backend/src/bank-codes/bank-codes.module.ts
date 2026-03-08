import { Module } from '@nestjs/common';
import { BankCodesController } from './bank-codes.controller';
import { BankCodesService } from '../services/bank-codes.service';
import { PaystackService } from '../services/paystack.service';

@Module({
  imports: [],
  controllers: [BankCodesController],
  providers: [BankCodesService, PaystackService],
  exports: [BankCodesService],
})
export class BankCodesModule {}
