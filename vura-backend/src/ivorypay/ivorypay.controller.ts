import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { IvoryPayService } from './ivorypay.service';
import { PrismaService } from '../prisma.service';

@Controller('ivorypay')
@UseGuards(AuthGuard)
export class IvoryPayController {
  constructor(
    private ivorypay: IvoryPayService,
    private prisma: PrismaService,
  ) {}

  /**
   * Preview how much NGN the user will receive for a given crypto amount.
   * GET /ivorypay/rates?amount=50&crypto=USDT&fiat=NGN
   */
  @Get('rates')
  async previewRate(
    @Query('amount') amount: string,
    @Query('crypto') crypto: string,
    @Query('fiat') fiat: string,
  ) {
    if (!amount || parseFloat(amount) <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }

    const rateData = await this.ivorypay.getRates(
      amount,
      crypto || 'USDT',
      fiat || 'NGN',
    );

    return { success: true, data: rateData };
  }

  /**
   * Get or create a persistent USDT deposit address for the user.
   * POST /ivorypay/deposit-address
   */
  @Post('deposit-address')
  async getDepositAddress(
    @Body('crypto') crypto: string,
    @Body('network') network: string,
    @Request() req: any,
  ) {
    const userId: string = req.user.userId;

    // Retrieve user email/name for IvoryPay
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    const addr = await this.ivorypay.createPermanentAddress(
      userId,
      user.emailEncrypted || `${user.vuraTag}@vura.app`,
      user.vuraTag,
      crypto || 'USDT',
      network || 'tron',
    );

    return { success: true, data: addr };
  }

  /**
   * Resolve a bank account (verify name before payout).
   * POST /ivorypay/resolve-account
   */
  @Post('resolve-account')
  async resolveAccount(
    @Body('bankCode') bankCode: string,
    @Body('accountNumber') accountNumber: string,
  ) {
    if (!bankCode || !accountNumber) {
      throw new BadRequestException('bankCode and accountNumber are required');
    }

    const resolved = await this.ivorypay.resolveBankAccount({
      bankCode,
      accountNumber,
    });

    return { success: true, data: resolved };
  }

  /**
   * Manually trigger a fiat payout (if auto-sweep is off).
   * POST /ivorypay/payout
   */
  @Post('payout')
  async manualPayout(
    @Body('amount') amount: string,
    @Body('crypto') crypto: string,
    @Request() req: any,
  ) {
    const userId: string = req.user.userId;

    if (!amount || parseFloat(amount) <= 0) {
      throw new BadRequestException('amount must be positive');
    }

    const bank = await this.prisma.bankAccount.findFirst({
      where: { userId, isPrimary: true, status: 'active' },
    });

    if (!bank) {
      throw new BadRequestException(
        'No primary bank account. Add one in Settings first.',
      );
    }

    const ref = `PAYOUT-${userId.slice(0, 8)}-${Date.now()}`;

    const payout = await this.ivorypay.initiateFiatPayout({
      amount,
      currency: 'NGN',
      bankCode: bank.bankCode,
      accountNumber: bank.accountNumber,
      accountName: bank.accountName,
      reference: ref,
      narration: `Vura manual payout ${ref}`,
      crypto: crypto || 'USDT',
    });

    return { success: true, data: payout };
  }

  /**
   * Verify a transaction by reference (fallback polling).
   * GET /ivorypay/verify/:reference
   */
  @Get('verify/:reference')
  async verify(@Param('reference') reference: string) {
    const result = await this.ivorypay.verifyTransaction(reference);
    return { success: true, data: result };
  }
}
