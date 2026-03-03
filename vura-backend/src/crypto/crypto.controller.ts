import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { BushaService } from './busha.service';
import { PrismaService } from '../prisma.service';

@Controller('crypto')
@UseGuards(AuthGuard)
export class CryptoController {
  constructor(
    private busha: BushaService,
    private prisma: PrismaService,
  ) {}

  /**
   * Generate (or retrieve) a deposit address for the authenticated user.
   * Returns the address string, network, memo, and min-confirmations.
   */
  @Post('deposit-address')
  async getDepositAddress(
    @Body('asset') asset: 'USDT' | 'BTC' | 'ETH',
    @Body('network') network: string,
    @Request() req: any,
  ) {
    const userId: string = req.user.userId;

    const validNetworks: Record<string, string[]> = {
      USDT: ['TRC20', 'BEP20', 'ERC20'],
      BTC: ['BTC'],
      ETH: ['ETH'],
    };

    if (!validNetworks[asset]?.includes(network)) {
      throw new BadRequestException(
        `Invalid network ${network} for ${asset}. Valid: ${validNetworks[asset]?.join(', ')}`,
      );
    }

    const address = await this.busha.getOrCreateDepositAddress(
      userId,
      asset,
      network,
    );

    return { success: true, data: address };
  }

  /**
   * List the user's recent crypto deposit transactions (last 50).
   */
  @Get('deposits')
  async getDepositHistory(@Request() req: any) {
    const userId: string = req.user.userId;

    const deposits = await this.prisma.cryptoDeposit.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { deposits: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });

    return {
      success: true,
      data: deposits.map((d: any) => ({
        id: d.id,
        asset: d.asset,
        network: d.network,
        address: d.address,
        status: d.status,
        createdAt: d.createdAt,
        transactions: (d.deposits ?? []).map((tx: any) => ({
          id: tx.id,
          cryptoAmount: tx.cryptoAmount?.toString() ?? '0',
          ngnAmount: tx.ngnAmount?.toString() ?? '0',
          exchangeRate: tx.exchangeRate?.toString() ?? '0',
          status: tx.status,
          confirmations: tx.confirmations,
          minConfirmations: tx.minConfirmations,
          createdAt: tx.createdAt,
          creditedAt: tx.creditedAt,
        })),
      })),
    };
  }

  /**
   * Current exchange rates for all supported pairs.
   */
  @Get('rates')
  async getExchangeRates() {
    const rates = await this.busha.getAllRates();
    return { success: true, data: rates };
  }

  /**
   * Get active deposit addresses for the user.
   */
  @Get('addresses')
  async getActiveAddresses(@Request() req: any) {
    const userId: string = req.user.userId;

    const addresses = await this.prisma.cryptoDeposit.findMany({
      where: { userId, status: 'active' },
      select: {
        asset: true,
        network: true,
        address: true,
        memo: true,
        createdAt: true,
      },
    });

    return { success: true, data: addresses };
  }

  /**
   * Toggle the auto-withdraw preference.
   * When enabled, confirmed crypto deposits are automatically sent to the
   * user's primary bank account after conversion.
   */
  @Patch('auto-withdraw')
  async toggleAutoWithdraw(
    @Body('enabled') enabled: boolean,
    @Request() req: any,
  ) {
    const userId: string = req.user.userId;

    if (enabled) {
      const bank = await this.prisma.bankAccount.findFirst({
        where: { userId, isPrimary: true, status: 'active' },
      });
      if (!bank) {
        throw new BadRequestException(
          'You must add a primary bank account before enabling auto-withdraw.',
        );
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { cryptoAutoWithdraw: enabled } as any,
    });

    return {
      success: true,
      data: { autoWithdraw: enabled },
    };
  }
}
