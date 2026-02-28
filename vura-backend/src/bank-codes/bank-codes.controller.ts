import { Controller, Get } from '@nestjs/common';
import { BankCodesService, BankInfo } from '../services/bank-codes.service';

@Controller('bank-codes')
export class BankCodesController {
  constructor(private readonly bankCodesService: BankCodesService) {}

  @Get()
  getBanks(): BankInfo[] {
    return this.bankCodesService.getAllBanks();
  }
}
