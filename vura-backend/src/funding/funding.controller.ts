import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Request,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PaystackService } from '../services/paystack.service';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import { v4 as uuid } from 'uuid';

@Controller('funding')
@UseGuards(AuthGuard)
export class FundingController {
  private readonly logger = new Logger(FundingController.name);

  constructor(
    private paystack: PaystackService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  @Post('initialize')
  async initializeFunding(
    @Request() req: { user: { userId: string } },
    @Body() body: { amount: number },
  ) {
    const { amount } = body;

    if (!amount || amount < 100 || amount > 10000000) {
      throw new BadRequestException('Amount must be between ₦100 and ₦10,000,000');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, emailEncrypted: true, vuraTag: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const reference = `FUND-${uuid()}`;
    const email = user.emailEncrypted || `${user.vuraTag}@vura.app`;
    const frontendUrl = this.config.get('FRONTEND_URL', 'https://vura-app.onrender.com');
    const callbackUrl = `${frontendUrl}/fund-wallet?ref=${reference}`;

    const fee = amount <= 2500 ? amount * 0.015 : Math.min(amount * 0.015, 2000);

    await this.prisma.transaction.create({
      data: {
        senderId: req.user.userId,
        amount,
        currency: 'NGN',
        type: 'deposit',
        status: 'PENDING',
        idempotencyKey: reference,
        reference,
        metadata: {
          method: 'paystack',
          fee: Math.ceil(fee),
        },
      },
    });

    const result = await this.paystack.initializeTransaction({
      email,
      amount,
      reference,
      callbackUrl,
      metadata: { userId: req.user.userId, type: 'wallet_funding' },
    });

    this.logger.log(`Fund wallet initialized: ₦${amount} by ${req.user.userId}`);

    return {
      success: true,
      data: {
        authorizationUrl: result.authorizationUrl,
        reference: result.reference,
        amount,
        fee: Math.ceil(fee),
        total: amount + Math.ceil(fee),
      },
    };
  }

  @Get('verify')
  async verifyFunding(
    @Request() req: { user: { userId: string } },
    @Query('reference') reference: string,
  ) {
    if (!reference) {
      throw new BadRequestException('Reference is required');
    }

    const tx = await this.prisma.transaction.findUnique({
      where: { reference },
    });

    if (!tx) {
      throw new BadRequestException('Transaction not found');
    }

    if (tx.status === 'SUCCESS') {
      return { success: true, message: 'Already credited', data: { reference, amount: tx.amount } };
    }

    const verification = await this.paystack.verifyTransaction(reference);

    if (!verification.success) {
      await this.prisma.transaction.update({
        where: { reference },
        data: { status: 'FAILED' },
      });
      throw new BadRequestException('Payment was not successful');
    }

    const amount = new Decimal(verification.amount);

    await this.prisma.$transaction(async (prisma) => {
      const balance = await prisma.balance.findUnique({
        where: { userId_currency: { userId: req.user.userId, currency: 'NGN' } },
      });

      const before = new Decimal(balance?.amount?.toString() ?? '0');
      const after = before.add(amount);

      await prisma.balance.upsert({
        where: { userId_currency: { userId: req.user.userId, currency: 'NGN' } },
        create: { userId: req.user.userId, currency: 'NGN', amount: after.toNumber(), lastUpdatedBy: 'funding' },
        update: { amount: after.toNumber(), lastUpdatedBy: 'funding' },
      });

      await prisma.transaction.update({
        where: { reference },
        data: {
          status: 'SUCCESS',
          beforeBalance: before.toNumber(),
          afterBalance: after.toNumber(),
        },
      });
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'WALLET_FUNDED',
        userId: req.user.userId,
        actorType: 'user',
        metadata: { reference, amount: amount.toString(), provider: 'paystack' },
      },
    });

    this.logger.log(`Wallet funded: ₦${amount} for ${req.user.userId} via Paystack`);

    return {
      success: true,
      message: `₦${amount.toFixed(2)} added to your wallet`,
      data: { reference, amount: amount.toNumber() },
    };
  }
}
