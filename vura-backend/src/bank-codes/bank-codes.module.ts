import { Module } from '@nestjs/common';
import { BankCodesController } from './bank-codes.controller';
import { BankCodesService } from '../services/bank-codes.service';
import { FlutterwaveService } from '../services/flutterwave.service';
import { PaystackService } from '../services/paystack.service';

@Module({
  controllers: [BankCodesController],
  providers: [BankCodesService, FlutterwaveService, PaystackService],
  exports: [BankCodesService],
})
export class BankCodesModule {}
