import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Query,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { AuthGuard } from '../auth/auth.guard';
import { BankCodesService } from '../services/bank-codes.service';
import { PaystackService } from '../services/paystack.service';
import { PrismaService } from '../prisma.service';
import { LimitsService } from '../limits/limits.service';
import Decimal from 'decimal.js';
import * as bcrypt from 'bcrypt';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private transactionsService: TransactionsService,
    private bankCodesService: BankCodesService,
    private paystackService: PaystackService,
    private prisma: PrismaService,
    private limitsService: LimitsService,
  ) {}

  @UseGuards(AuthGuard)
  @Post('send')
  async sendMoney(
    @Request() req: { user: { userId: string } },
    @Body()
    body: {
      recipientTag: string;
      amount: number;
      description?: string;
      pin?: string;
    },
  ) {
    if (!body.pin) {
      throw new BadRequestException('PIN is required to send money');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { hashedPin: true },
    });
    if (!user?.hashedPin) {
      throw new UnauthorizedException('Account not ready. Set your PIN in Settings.');
    }
    const pinValid = await bcrypt.compare(body.pin, user.hashedPin);
    if (!pinValid) {
      throw new UnauthorizedException('Invalid PIN');
    }
    return this.transactionsService.sendMoney(
      req.user.userId,
      body.recipientTag,
      body.amount,
      body.description,
      body.pin,
    );
  }

  @UseGuards(AuthGuard)
  @Post('send-to-bank')
  async sendToBank(
    @Request() req: { user: { userId: string } },
    @Body()
    body: {
      accountNumber: string;
      bankCode: string;
      accountName: string;
      amount: number;
      description?: string;
      pin?: string;
    },
  ) {
    const userId = req.user.userId;
    const { accountNumber, bankCode, accountName, amount, description, pin } = body;

    if (!amount || amount < 100) {
      throw new BadRequestException('Minimum transfer is ₦100');
    }

    if (!pin) {
      throw new BadRequestException('PIN is required for bank transfer');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { hashedPin: true },
    });
    if (!user?.hashedPin) {
      throw new UnauthorizedException('Account not ready. Set your PIN in Settings.');
    }
    const pinValid = await bcrypt.compare(pin, user.hashedPin);
    if (!pinValid) {
      throw new UnauthorizedException('Invalid PIN');
    }

    const fee = amount <= 5000 ? 10 : amount <= 50000 ? 25 : 50;
    const totalDeduction = amount + fee;
    await this.limitsService.checkSendLimit(userId, new Decimal(totalDeduction), 'NGN');

    const verificationResult = await this.paystackService.verifyAccount(
      accountNumber,
      bankCode,
    );
    const reference = `BANK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const tx = await this.prisma.$transaction(async (prisma) => {
      const balance = await prisma.balance.findUnique({
        where: { userId_currency: { userId, currency: 'NGN' } },
      });

      const current = new Decimal(balance?.amount?.toString() ?? '0');
      if (current.lessThan(totalDeduction)) {
        throw new BadRequestException(
          `Insufficient balance. You need ₦${totalDeduction.toFixed(0)} (amount + ₦${fee} fee).`,
        );
      }

      const after = current.sub(totalDeduction);

      await prisma.balance.update({
        where: { userId_currency: { userId, currency: 'NGN' } },
        data: { amount: after.toNumber(), lastUpdatedBy: 'send_to_bank' },
      });

      const transaction = await prisma.transaction.create({
        data: {
          senderId: userId,
          amount: totalDeduction,
          currency: 'NGN',
          type: 'external_transfer',
          status: 'PENDING',
          idempotencyKey: reference,
          reference,
          beforeBalance: current.toNumber(),
          afterBalance: after.toNumber(),
          metadata: {
            accountNumber,
            bankCode,
            accountName: accountName || verificationResult.accountName,
            transferAmount: amount,
            fee,
            provider: 'paystack',
          },
        },
      });

      return { transaction, after };
    });

    try {
      const transferResult = await this.paystackService.initiateTransfer(
        accountNumber,
        bankCode,
        accountName || verificationResult.accountName,
        amount,
        reference,
        description,
      );

      await this.prisma.transaction.update({
        where: { id: tx.transaction.id },
        data: { providerTxId: transferResult.reference },
      });

      return {
        success: true,
        reference: transferResult.reference,
        status: transferResult.status,
        accountName: verificationResult.accountName,
        amount,
        fee,
        totalDeduction,
        provider: 'paystack',
      };
    } catch (err: any) {
      await this.prisma.$transaction(async (prisma) => {
        const balance = await prisma.balance.findUnique({
          where: { userId_currency: { userId, currency: 'NGN' } },
        });
        const current = new Decimal(balance?.amount?.toString() ?? '0');
        const refunded = current.add(totalDeduction);
        await prisma.balance.update({
          where: { userId_currency: { userId, currency: 'NGN' } },
          data: { amount: refunded.toNumber(), lastUpdatedBy: 'send_to_bank_refund' },
        });
        await prisma.transaction.update({
          where: { id: tx.transaction.id },
          data: { status: 'FAILED' },
        });
      });
      const message =
        (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ||
        (err as Error).message ||
        'Transfer failed. Your balance has been refunded.';
      throw new BadRequestException(message);
    }
  }

  @UseGuards(AuthGuard)
  @Get()
  getTransactions(
    @Request() req: any,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.transactionsService.getTransactions(
      req.user.userId,
      type,
      limit ? parseInt(limit) : 20,
      offset ? parseInt(offset) : 0,
    );
  }

  @UseGuards(AuthGuard)
  @Get('balance')
  getBalance(@Request() req: any) {
    return this.transactionsService.getBalance(req.user.userId);
  }

  @UseGuards(AuthGuard)
  @Get('lookup')
  lookupTag(@Query('tag') tag: string) {
    return this.transactionsService.lookupTag(tag);
  }

  @UseGuards(AuthGuard)
  @Get('verify-account')
  async verifyAccount(
    @Query('accountNumber') accountNumber: string,
    @Query('bankCode') bankCode: string,
  ) {
    try {
      const result = await this.paystackService.verifyAccount(
        accountNumber,
        bankCode,
      );

      return {
        success: true,
        accountName: result.accountName,
        provider: 'paystack',
      };
    } catch (error: any) {
      console.error('verify-account failed', { bankCode, error: error.message });
      throw new BadRequestException(
        'We could not verify this account. Please confirm the bank and account number and try again.',
      );
    }
  }

  @UseGuards(AuthGuard)
  @Get('transfer-fee')
  getTransferFee(@Query('amount') amount: string) {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException('Invalid amount');
    }

    const fee = parsed <= 5000 ? 10 : parsed <= 50000 ? 25 : 50;

    return {
      success: true,
      fee,
      stampDuty: 0,
      totalFee: fee,
      provider: 'paystack',
    };
  }
}
