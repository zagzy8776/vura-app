import { Controller, Post, Get, Body, UseGuards, Request, Query, BadRequestException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { AuthGuard } from '../auth/auth.guard';
import { PaystackService } from '../services/paystack.service';
import { BankCodesService } from '../services/bank-codes.service';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private transactionsService: TransactionsService,
    private paystackService: PaystackService,
    private bankCodesService: BankCodesService
  ) {}

  @UseGuards(AuthGuard)
  @Post('send')
  sendMoney(
    @Request() req: { user: { userId: string } },
    @Body() body: { recipientTag: string; amount: number; description?: string; pin?: string }
  ) {
    return this.transactionsService.sendMoney(
      req.user.userId,
      body.recipientTag,
      body.amount,
      body.description,
      body.pin
    );
  }

  @UseGuards(AuthGuard)
  @Post('send-to-bank')
  async sendToBank(
    @Request() req: { user: { userId: string } },
    @Body() body: { 
      accountNumber: string; 
      bankCode: string; 
      accountName: string; 
      amount: number; 
      description?: string; 
      pin?: string;
    }
  ) {
    const { accountNumber, bankCode, accountName, amount, description } = body;
    
    // Verify account using Paystack
    const verificationResult = await this.paystackService.verifyAccount(accountNumber, bankCode);

    // Send to bank using Paystack
    const reference = `BANK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const transferResult = await this.paystackService.initiateTransfer(
      accountNumber,
      bankCode,
      accountName || verificationResult.accountName,
      amount,
      reference,
      description
    );

    return {
      success: true,
      reference: transferResult.reference,
      status: transferResult.status,
      accountName: verificationResult.accountName,
      amount,
      fee: Math.max(10, amount * 0.015),
    };
  }

  @UseGuards(AuthGuard)
  @Get()
  getTransactions(
    @Request() req: any,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    return this.transactionsService.getTransactions(
      req.user.userId,
      type,
      limit ? parseInt(limit) : 20,
      offset ? parseInt(offset) : 0
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
    @Query('bankCode') bankCode: string
  ) {
    try {
      const result = await this.paystackService.verifyAccount(accountNumber, bankCode);
      return {
        success: true,
        accountName: result.accountName,
        provider: 'paystack',
      };
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      throw new BadRequestException(
        `Verification failed for bank ${bankCode}. Paystack: ${errorMessage}. Try a different bank.`
      );
    }
  }
}
