import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { YellowCardService } from './yellowcard.service';
import { PrismaService } from '../prisma.service';

class GenerateAddressDto {
  asset: 'USDT' | 'BTC' | 'ETH';
  network: string;
}

@Controller('crypto')
@UseGuards(AuthGuard)
export class CryptoController {
  constructor(
    private yellowcard: YellowCardService,
    private prisma: PrismaService,
  ) {}

  /**
   * Get or generate deposit address for a user
   */
  @Post('deposit-address')
  async getDepositAddress(
    @Body() dto: GenerateAddressDto,
    @Request() req: any,
  ) {
    const userId = req.user.userId;

    // Validate network
    const validNetworks: Record<string, string[]> = {
      USDT: ['TRC20', 'BEP20', 'ERC20'],
      BTC: ['BTC'],
      ETH: ['ETH'],
    };

    if (!validNetworks[dto.asset]?.includes(dto.network)) {
      throw new BadRequestException(
        `Invalid network ${dto.network} for ${dto.asset}. Valid: ${validNetworks[dto.asset]?.join(', ')}`,
      );
    }

    // Generate or retrieve address
    const address = await this.yellowcard.generateDepositAddress(
      userId,
      dto.asset,
      dto.network,
    );

    return {
      success: true,
      data: address,
    };
  }

  /**
   * Get user's deposit history
   */
  @Get('deposits')
  async getDepositHistory(@Request() req: any) {
    const userId = req.user.userId;

    const deposits = await this.prisma.cryptoDepositTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      success: true,
      data: deposits.map((d: any) => ({
        id: d.id,
        asset: d.asset,
        network: d.network,
        cryptoAmount: d.cryptoAmount.toString(),
        ngnAmount: d.ngnAmount?.toString(),
        exchangeRate: d.exchangeRate?.toString(),
        status: d.status,
        confirmations: d.confirmations,
        minConfirmations: d.minConfirmations,
        ewsFlags: d.ewsFlags,
        holdUntil: d.holdUntil,
        createdAt: d.createdAt,
        creditedAt: d.creditedAt,
      })),
    };
  }

  /**
   * Get current exchange rates
   */
  @Get('rates')
  async getExchangeRates() {
    const pairs = ['USDT_NGN', 'BTC_NGN', 'ETH_NGN'];
    const rates: Record<string, string> = {};

    for (const pair of pairs) {
      const rate = await this.yellowcard.getExchangeRate(pair);
      rates[pair] = rate.toString();
    }

    return {
      success: true,
      data: rates,
    };
  }

  /**
   * Get active deposit addresses for user
   */
  @Get('addresses')
  async getActiveAddresses(@Request() req: any) {
    const userId = req.user.userId;

    const addresses = await this.prisma.cryptoDeposit.findMany({
      where: {
        userId,
        status: 'active',
      },
      select: {
        asset: true,
        network: true,
        address: true,
        memo: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      data: addresses,
    };
  }
}
