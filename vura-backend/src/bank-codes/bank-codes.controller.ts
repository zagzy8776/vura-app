import { Controller, Get, Logger } from '@nestjs/common';
import { BankCodesService, BankInfo } from '../services/bank-codes.service';
import { PaystackService } from '../services/paystack.service';

@Controller('bank-codes')
export class BankCodesController {
  private readonly logger = new Logger(BankCodesController.name);

  constructor(
    private readonly bankCodesService: BankCodesService,
    private readonly paystackService: PaystackService,
  ) {}

  @Get()
  getBanks(): BankInfo[] {
    return this.bankCodesService.getAllBanks();
  }

  /**
   * Send-to-bank is enabled when Paystack is configured (PAYSTACK_SECRET_KEY).
   * Set PAYSTACK_TRANSFER_ENABLED=true when Transfer is enabled in Paystack dashboard.
   */
  @Get('send-to-bank-status')
  getSendToBankStatus() {
    const configured = this.paystackService.isConfigured();
    const transferEnabled = this.paystackService.isTransferEnabled();
    return {
      sendToBankEnabled: configured,
      transferEnabled,
      provider: configured ? 'paystack' : null,
    };
  }

  /**
   * Banks for send-to-bank. Paystack only – list from Paystack so codes match resolve/transfer.
   */
  @Get('for-send-to-bank')
  async getBanksForSendToBank() {
    if (!this.paystackService.isConfigured()) {
      this.logger.log('for-send-to-bank: Paystack not configured');
      return {
        success: true,
        banks: [],
        transferAvailable: false,
        provider: null,
        reason: 'not_configured',
        message: 'Bank transfer is not available. Configure PAYSTACK_SECRET_KEY.',
      };
    }
    try {
      const banks = await this.paystackService.listBanks();
      this.logger.log(`for-send-to-bank: Paystack OK, ${banks.length} banks`);
      return {
        success: true,
        banks,
        transferAvailable: true,
        provider: 'paystack',
        reason: undefined,
        message: undefined,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not load bank list.';
      this.logger.warn(`for-send-to-bank: Paystack error - ${message}`);
      return {
        success: false,
        banks: [],
        transferAvailable: false,
        provider: null,
        reason: 'paystack_error',
        message,
      };
    }
  }

  /** Banks from Paystack (same list as for-send-to-bank). */
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
