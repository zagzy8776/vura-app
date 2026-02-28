import { Module } from '@nestjs/common';
import { BankCodesController } from './bank-codes.controller';
import { BankCodesService } from '../services/bank-codes.service';

@Module({
  controllers: [BankCodesController],
  providers: [BankCodesService],
  exports: [BankCodesService],
})
export class BankCodesModule {}
