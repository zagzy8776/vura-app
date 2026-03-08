import { Controller, Get } from '@nestjs/common';
import { BankCodesService, BankInfo } from '../services/bank-codes.service';
import { PaystackService } from '../services/paystack.service';
import { KorapayService } from '../services/korapay.service';

@Controller('bank-codes')
export class BankCodesController {
  constructor(
    private readonly bankCodesService: BankCodesService,
    private readonly paystackService: PaystackService,
    private readonly korapayService: KorapayService,
  ) {}

  @Get()
  getBanks(): BankInfo[] {
    return this.bankCodesService.getAllBanks();
  }

  /**
   * Banks for send-to-bank form. Returns Korapay list when Korapay is configured (so codes match verify/transfer), else Paystack.
   */
  @Get('for-send-to-bank')
  async getBanksForSendToBank() {
    if (this.korapayService.isConfigured()) {
      const banks = await this.korapayService.listBanks();
      return {
        success: true,
        banks,
        provider: 'korapay',
      };
    }
    const result = await this.paystackService.listBanks();
    return {
      success: true,
      banks: result.map((b) => ({ code: b.code, name: b.name })),
      provider: 'paystack',
    };
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
