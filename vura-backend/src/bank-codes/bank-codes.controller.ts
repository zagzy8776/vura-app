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
   * Health/config: whether send-to-bank is enabled (VPay configured). No keys or secrets exposed.
   */
  @Get('send-to-bank-status')
  getSendToBankStatus() {
    return { sendToBankEnabled: this.vpayService.isConfigured() };
  }

  /**
   * Banks for send-to-bank. VPay only: when configured returns VPay bank list and enables transfer.
   * When VPay is not configured: success true, empty banks, transferAvailable false.
   * When VPay fails (e.g. login/network): success false, message for retry.
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
    try {
      const banks = await this.vpayService.getBankList();
      return {
        success: true,
        banks,
        transferAvailable: true,
        provider: 'vpay',
        message: undefined,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not load bank list.';
      return {
        success: false,
        banks: [],
        transferAvailable: false,
        provider: null,
        message: message.includes('login') ? 'Bank service is temporarily unavailable. Please try again in a moment.' : 'Could not load banks. Please try again.',
      };
    }
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
