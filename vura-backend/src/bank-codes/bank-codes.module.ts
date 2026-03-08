import { Module } from '@nestjs/common';
import { BankCodesController } from './bank-codes.controller';
import { BankCodesService } from '../services/bank-codes.service';
import { PaystackService } from '../services/paystack.service';
import { VpayModule } from '../vpay/vpay.module';

@Module({
  imports: [VpayModule],
  controllers: [BankCodesController],
  providers: [BankCodesService, PaystackService],
  exports: [BankCodesService],
})
export class BankCodesModule {}
