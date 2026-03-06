import { Controller, Get } from '@nestjs/common';
import { BankCodesService, BankInfo } from '../services/bank-codes.service';
import { FlutterwaveService } from '../services/flutterwave.service';
import { PaystackService } from '../services/paystack.service';

@Controller('bank-codes')
export class BankCodesController {
  constructor(
    private readonly bankCodesService: BankCodesService,
    private readonly flutterwaveService: FlutterwaveService,
    private readonly paystackService: PaystackService,
  ) {}

  @Get()
  getBanks(): BankInfo[] {
    return this.bankCodesService.getAllBanks();
  }

  /**
   * Fetch banks from Flutterwave (for legacy / other flows).
   */
  @Get('flutterwave')
  async getFlutterwaveBanks() {
    const result = await this.flutterwaveService.getBanks('NG');
    if (!result.success) {
      return { success: false, error: result.error };
    }

    return {
      success: true,
      banks: result.banks,
      provider: 'flutterwave',
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
