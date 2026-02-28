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
import { FlutterwaveService } from '../services/flutterwave.service';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private transactionsService: TransactionsService,
    private bankCodesService: BankCodesService,
    private flutterwaveService: FlutterwaveService,
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

    // Flutterwave-only: verify and transfer using Flutterwave
    const reference = `BANK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const verificationResult = await this.flutterwaveService.verifyAccount(
      accountNumber,
      bankCode,
    );
    if (!verificationResult.success) {
      throw new BadRequestException(
        `Verification failed for bank ${bankCode}. Flutterwave: ${verificationResult.error || 'Unknown error'}. Try a different bank.`,
      );
    }

    const transferResult = await this.flutterwaveService.initiateTransfer(
      accountNumber,
      bankCode,
      accountName || verificationResult.accountName,
      amount,
      reference,
      description,
    );

    if (!transferResult.success) {
      throw new BadRequestException(
        `Transfer failed. Flutterwave: ${transferResult.error || 'Unknown error'}`,
      );
    }

    return {
      success: true,
      reference: transferResult.reference,
      status: transferResult.status,
      accountName: verificationResult.accountName,
      amount,
      fee: transferResult.fee,
      stampDuty: transferResult.stampDuty,
      totalDeduction: transferResult.totalDeduction,
      provider: 'flutterwave',
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
      const result = await this.flutterwaveService.verifyAccount(
        accountNumber,
        bankCode,
      );
      if (!result.success) {
        throw new BadRequestException(result.error || 'Could not verify account');
      }

      return {
        success: true,
        accountName: result.accountName,
        provider: 'flutterwave',
      };
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Unknown error';
      throw new BadRequestException(
        `Verification failed for bank ${bankCode}. Flutterwave: ${errorMessage}. Try a different bank.`,
      );
    }
  }

  /**
   * Return Flutterwave fee breakdown for bank transfers
   * Rules (2026): ₦10 for < ₦10k, ₦25 for ≥ ₦10k + ₦50 stamp duty for ≥ ₦10k
   */
  @Get('transfer-fee')
  getTransferFee(@Query('amount') amount: string) {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException('Invalid amount');
    }

    const feeInfo = this.flutterwaveService.calculateTransferFee(parsed);
    return {
      success: true,
      fee: feeInfo.fee,
      stampDuty: feeInfo.stampDuty,
      totalFee: feeInfo.total,
      provider: 'flutterwave',
    };
  }
}
