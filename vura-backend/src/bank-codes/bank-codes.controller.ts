import { Controller, Get } from '@nestjs/common';
import { BankCodesService, BankInfo } from '../services/bank-codes.service';
import { FlutterwaveService } from '../services/flutterwave.service';

@Controller('bank-codes')
export class BankCodesController {
  constructor(
    private readonly bankCodesService: BankCodesService,
    private readonly flutterwaveService: FlutterwaveService,
  ) {}

  @Get()
  getBanks(): BankInfo[] {
    return this.bankCodesService.getAllBanks();
  }

  /**
   * Fetch banks from Flutterwave so frontend uses valid Flutterwave bank codes.
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
}
