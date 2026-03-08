import { Controller, Get } from '@nestjs/common';
import { BankCodesService, BankInfo } from '../services/bank-codes.service';
import { PaystackService } from '../services/paystack.service';
import { VpayService } from '../services/vpay.service';

@Controller('bank-codes')
export class BankCodesController {
  constructor(
    private readonly bankCodesService: BankCodesService,
    private readonly paystackService: PaystackService,
    private readonly vpayService: VpayService,
  ) {}

  @Get()
  getBanks(): BankInfo[] {
    return this.bankCodesService.getAllBanks();
  }

  /**
   * Banks for send-to-bank. VPay only: when configured returns VPay bank list and enables transfer.
   * No Paystack in this flow.
   */
  @Get('for-send-to-bank')
  async getBanksForSendToBank() {
    if (!this.vpayService.isConfigured()) {
      return {
        success: true,
        banks: [],
        transferAvailable: false,
        provider: null,
        message: 'Bank transfer is not available. Use @tag to send to other Vura users.',
      };
    }
    const banks = await this.vpayService.getBankList();
    return {
      success: true,
      banks,
      transferAvailable: true,
      provider: 'vpay',
      message: undefined,
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
