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
import { PrismaService } from '../prisma.service';
import { LimitsService } from '../limits/limits.service';
import * as bcrypt from 'bcrypt';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private transactionsService: TransactionsService,
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
    if (!body.pin) {
      throw new BadRequestException('PIN is required to send money');
    }
    return this.transactionsService.sendToBank(
      req.user.userId,
      body.accountNumber,
      body.bankCode,
      body.accountName,
      body.amount,
      body.description,
      body.pin,
    );
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
    if (!accountNumber?.trim() || !bankCode?.trim()) {
      throw new BadRequestException('accountNumber and bankCode are required');
    }
    const result = await this.transactionsService.verifyBankAccount(
      accountNumber.trim(),
      bankCode.trim(),
    );
    return { accountName: result.accountName };
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
