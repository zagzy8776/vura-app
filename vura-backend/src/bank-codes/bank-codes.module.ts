import { Module } from '@nestjs/common';
import { BankCodesController } from './bank-codes.controller';
import { BankCodesService } from '../services/bank-codes.service';
import { FlutterwaveService } from '../services/flutterwave.service';

@Module({
  controllers: [BankCodesController],
  providers: [BankCodesService, FlutterwaveService],
  exports: [BankCodesService],
})
export class BankCodesModule {}
