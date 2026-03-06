import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { AuthGuard } from '../auth/auth.guard';
import { BankCodesService } from '../services/bank-codes.service';
import { PaystackService } from '../services/paystack.service';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private transactionsService: TransactionsService,
    private bankCodesService: BankCodesService,
    private paystackService: PaystackService,
  ) {}

  @UseGuards(AuthGuard)
  @Post('send')
  sendMoney(
    @Request() req: { user: { userId: string } },
    @Body()
    body: {
      recipientTag: string;
      amount: number;
      description?: string;
      pin?: string;
    },
  ) {
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
    const { accountNumber, bankCode, accountName, amount, description } = body;

    const reference = `BANK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const verificationResult = await this.paystackService.verifyAccount(
      accountNumber,
      bankCode,
    );

    const fee = amount <= 5000 ? 10 : amount <= 50000 ? 25 : 50;

    const transferResult = await this.paystackService.initiateTransfer(
      accountNumber,
      bankCode,
      accountName || verificationResult.accountName,
      amount,
      reference,
      description,
    );

    return {
      success: true,
      reference: transferResult.reference,
      status: transferResult.status,
      accountName: verificationResult.accountName,
      amount,
      fee,
      totalDeduction: amount + fee,
      provider: 'paystack',
    };
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

  @Get('lookup')
  lookupTag(@Query('tag') tag: string) {
    return this.transactionsService.lookupTag(tag);
  }

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
