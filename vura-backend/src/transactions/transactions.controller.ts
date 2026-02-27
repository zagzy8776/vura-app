import { Controller, Post, Get, Body, UseGuards, Request, Query } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { AuthGuard } from '../auth/auth.guard';
import { PaystackService } from '../services/paystack.service';
import { MonnifyService } from '../services/monnify.service';
import { BankCodesService } from '../services/bank-codes.service';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private transactionsService: TransactionsService,
    private paystackService: PaystackService,
    private monnifyService: MonnifyService,
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
      paymentProvider?: 'paystack' | 'monnify';
    }
  ) {
    const { accountNumber, bankCode, accountName, amount, description, pin, paymentProvider = 'paystack' } = body;
    
    // Verify account first
    let verificationResult;
    if (paymentProvider === 'paystack') {
      verificationResult = await this.paystackService.verifyAccount(accountNumber, bankCode);
    } else {
      verificationResult = await this.monnifyService.verifyAccount(accountNumber, bankCode);
    }

    // Send to bank using the selected provider
    const reference = `BANK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let transferResult;
    
    if (paymentProvider === 'paystack') {
      transferResult = await this.paystackService.initiateTransfer(
        accountNumber,
        bankCode,
        accountName || verificationResult.accountName,
        amount,
        reference,
        description
      );
    } else {
      transferResult = await this.monnifyService.initiateTransfer(
        accountNumber,
        bankCode,
        accountName || verificationResult.accountName,
        amount,
        reference,
        description
      );
    }

    return {
      success: true,
      reference: transferResult.reference,
      status: transferResult.status,
      accountName: verificationResult.accountName,
      amount,
      fee: Math.max(10, amount * 0.015), // 1.5% fee for bank transfers
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
    @Query('bankCode') bankCode: string,
    @Query('provider') provider: 'paystack' | 'monnify' = 'paystack'
  ) {
    try {
      if (provider === 'paystack') {
        const result = await this.paystackService.verifyAccount(accountNumber, bankCode);
        return {
          success: true,
          accountName: result.accountName,
        };
      } else {
        const result = await this.monnifyService.verifyAccount(accountNumber, bankCode);
        return {
          success: true,
          accountName: result.accountName,
        };
      }
    } catch (error: any) {
      // If Paystack fails, try Monnify as fallback
      if (provider === 'paystack') {
        try {
          const monnifyResult = await this.monnifyService.verifyAccount(accountNumber, bankCode);
          return {
            success: true,
            accountName: monnifyResult.accountName,
            provider: 'monnify',
          };
        } catch {
          // Return original error
          throw error;
        }
      }
      throw error;
    }
  }
}
