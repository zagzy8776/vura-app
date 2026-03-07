import { Controller, Get } from '@nestjs/common';
import { BankCodesService, BankInfo } from '../services/bank-codes.service';
import { PaystackService } from '../services/paystack.service';

@Controller('bank-codes')
export class BankCodesController {
  constructor(
    private readonly bankCodesService: BankCodesService,
    private readonly paystackService: PaystackService,
  ) {}

  @Get()
  getBanks(): BankInfo[] {
    return this.bankCodesService.getAllBanks();
  }

  /**
   * Fetch banks from Paystack. Use this for send-to-bank and account verification
   * so codes match Paystack resolve/transfer APIs.
   */
  @Get('paystack')
  async getPaystackBanks() {
    const banks = await this.paystackService.listBanks();
    return {
      success: true,
      banks: banks.map((b) => ({ code: b.code, name: b.name })),
      provider: 'paystack',
    };
  }
}
