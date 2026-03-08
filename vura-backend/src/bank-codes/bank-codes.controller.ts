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
   * Banks for send-to-bank form. When Korapay is configured, use its list (250+ banks) so codes match verify/transfer.
   * If Korapay returns very few banks (e.g. test mode), fall back to Paystack so users get the full list.
   */
  @Get('for-send-to-bank')
  async getBanksForSendToBank() {
    if (this.korapayService.isConfigured()) {
      const korapayBanks = await this.korapayService.listBanks();
      const minBanksForKorapay = 15;
      if (korapayBanks.length >= minBanksForKorapay) {
        return {
          success: true,
          banks: korapayBanks,
          provider: 'korapay',
        };
      }
      // Korapay returned few banks (e.g. test/sandbox); use Paystack list so users see full bank list
      const paystackBanks = await this.paystackService.listBanks();
      return {
        success: true,
        banks: paystackBanks.map((b) => ({ code: b.code, name: b.name })),
        provider: 'paystack',
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
