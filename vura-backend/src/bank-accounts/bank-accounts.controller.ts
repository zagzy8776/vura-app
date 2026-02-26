import { Controller, Post, Get, Delete, UseGuards, Request, Body, Param } from '@nestjs/common';
import { BankAccountsService } from './bank-accounts.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('bank-accounts')
@UseGuards(AuthGuard)
export class BankAccountsController {
  constructor(private bankAccountsService: BankAccountsService) {}

  @Post()
  async createBankAccount(
    @Request() req: { user: { userId: string } },
    @Body() body: {
      accountNumber: string;
      bankCode: string;
      bankName: string;
      accountName: string;
      provider?: 'paystack' | 'monnify';
    }
  ) {
    return this.bankAccountsService.createBankAccount(
      req.user.userId,
      body.accountNumber,
      body.bankCode,
      body.bankName,
      body.accountName,
      body.provider || 'paystack'
    );
  }

  @Get()
  async getUserBankAccounts(@Request() req: { user: { userId: string } }) {
    return this.bankAccountsService.getUserBankAccounts(req.user.userId);
  }

  @Get('primary')
  async getPrimaryBankAccount(@Request() req: { user: { userId: string } }) {
    return this.bankAccountsService.getPrimaryBankAccount(req.user.userId);
  }

  @Post(':id/set-primary')
  async setPrimaryBankAccount(
    @Request() req: { user: { userId: string } },
    @Param('id') accountId: string
  ) {
    return this.bankAccountsService.setPrimaryBankAccount(req.user.userId, accountId);
  }

  @Delete(':id')
  async deleteBankAccount(
    @Request() req: { user: { userId: string } },
    @Param('id') accountId: string
  ) {
    await this.bankAccountsService.deleteBankAccount(req.user.userId, accountId);
    return { success: true, message: 'Bank account deleted successfully' };
  }
}