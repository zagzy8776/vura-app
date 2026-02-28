import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BankAccount } from '@prisma/client';

@Injectable()
export class BankAccountsService {
  constructor(private prisma: PrismaService) {}

  async createBankAccount(
    userId: string,
    accountNumber: string,
    bankCode: string,
    bankName: string,
    accountName: string,
    provider: 'paystack' | 'monnify' = 'paystack',
  ): Promise<BankAccount> {
    // Check if user already has a primary account
    const existingPrimary = await this.prisma.bankAccount.findFirst({
      where: {
        userId,
        isPrimary: true,
        status: 'active',
      },
    });

    // Create the bank account
    const bankAccount = await this.prisma.bankAccount.create({
      data: {
        userId,
        accountNumber,
        bankCode,
        bankName,
        accountName,
        isPrimary: !existingPrimary,
        provider,
      },
    });

    return bankAccount;
  }

  async getUserBankAccounts(userId: string): Promise<BankAccount[]> {
    return this.prisma.bankAccount.findMany({
      where: {
        userId,
        status: 'active',
      },
      orderBy: {
        isPrimary: 'desc',
      },
    });
  }

  async getPrimaryBankAccount(userId: string): Promise<BankAccount | null> {
    return this.prisma.bankAccount.findFirst({
      where: {
        userId,
        isPrimary: true,
        status: 'active',
      },
    });
  }

  async setPrimaryBankAccount(
    userId: string,
    accountId: string,
  ): Promise<BankAccount> {
    // Check if the account belongs to the user
    const account = await this.prisma.bankAccount.findFirst({
      where: {
        id: accountId,
        userId,
        status: 'active',
      },
    });

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    // Set all other accounts to non-primary
    await this.prisma.bankAccount.updateMany({
      where: {
        userId,
        isPrimary: true,
      },
      data: {
        isPrimary: false,
      },
    });

    // Set the selected account as primary
    return this.prisma.bankAccount.update({
      where: {
        id: accountId,
      },
      data: {
        isPrimary: true,
      },
    });
  }

  async deleteBankAccount(userId: string, accountId: string): Promise<void> {
    const account = await this.prisma.bankAccount.findFirst({
      where: {
        id: accountId,
        userId,
        status: 'active',
      },
    });

    if (!account) {
      throw new NotFoundException('Bank account not found');
    }

    // If it's the primary account, set another one as primary
    if (account.isPrimary) {
      const otherAccounts = await this.prisma.bankAccount.findMany({
        where: {
          userId,
          id: { not: accountId },
          status: 'active',
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: 1,
      });

      if (otherAccounts.length > 0) {
        await this.prisma.bankAccount.update({
          where: {
            id: otherAccounts[0].id,
          },
          data: {
            isPrimary: true,
          },
        });
      }
    }

    await this.prisma.bankAccount.update({
      where: {
        id: accountId,
      },
      data: {
        status: 'deleted',
      },
    });
  }
}
