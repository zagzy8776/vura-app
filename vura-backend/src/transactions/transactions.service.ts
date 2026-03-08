import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LimitsService } from '../limits/limits.service';
import { HoldsService } from '../holds/holds.service';
import { PaystackService } from '../services/paystack.service';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import Decimal from 'decimal.js';

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private limitsService: LimitsService,
    private holdsService: HoldsService,
    private paystackService: PaystackService,
  ) {}

  async initiatePayment(
    senderId: string,
    recipient: string,
    amount: number,
    description?: string,
    pin?: string,
  ) {
    await this.limitsService.checkSendLimit(
      senderId,
      new Decimal(amount),
      'NGN',
    );
    await this.holdsService.checkHeldFunds(senderId, new Decimal(amount));

    if (pin) {
      const user = await this.prisma.user.findUnique({
        where: { id: senderId },
      });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      const pinValid = await bcrypt.compare(pin, user.hashedPin || '');
      if (!pinValid) {
        throw new UnauthorizedException('Invalid PIN');
      }
    }

    if (recipient.startsWith('@') || this.isValidVuraTag(recipient)) {
      return await this.handleInternalTransfer(
        senderId,
        recipient,
        amount,
        description,
      );
    } else if (this.isValidPhoneNumber(recipient)) {
      return await this.handleRequestFlow(
        senderId,
        recipient,
        amount,
        description,
      );
    } else if (this.isValidBankAccount(recipient)) {
      return await this.handleExternalTransfer(
        senderId,
        recipient,
        amount,
        description,
      );
    } else {
      throw new BadRequestException('Invalid recipient format');
    }
  }

  private async handleInternalTransfer(
    senderId: string,
    recipientTag: string,
    amount: number,
    description?: string,
  ) {
    const recipient = await this.prisma.user.findUnique({
      where: { vuraTag: recipientTag },
    });

    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    if (recipient.id === senderId) {
      throw new BadRequestException('Cannot send money to yourself');
    }

    const senderBalance = await this.prisma.balance.findUnique({
      where: { userId_currency: { userId: senderId, currency: 'NGN' } },
    });

    if (!senderBalance || Number(senderBalance.amount) < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    // Vura-to-Vura transfers are free
    const fee = 0;
    const total = amount;
    const idempotencyKey = uuidv4();
    const reference = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return await this.prisma.$transaction(async (tx) => {
      const beforeBalance = Number(senderBalance.amount);
      await tx.balance.update({
        where: { id: senderBalance.id },
        data: { amount: beforeBalance - total, lastUpdatedBy: 'user' },
      });

      const recipientBalance = await tx.balance.findUnique({
        where: { userId_currency: { userId: recipient.id, currency: 'NGN' } },
      });

      const recipientBefore = Number(recipientBalance?.amount || 0);
      const recipientAfter = recipientBefore + amount;
      await tx.balance.upsert({
        where: { userId_currency: { userId: recipient.id, currency: 'NGN' } },
        create: { userId: recipient.id, currency: 'NGN', amount: recipientAfter, lastUpdatedBy: 'user' },
        update: { amount: recipientAfter, lastUpdatedBy: 'user' },
      });

      const { shouldFlag, reason } =
        await this.holdsService.shouldFlagTransaction(
          senderId,
          new Decimal(amount),
          1,
        );

      const heldUntil = shouldFlag
        ? this.holdsService.calculateHoldExpiry()
        : null;

      const transaction = await tx.transaction.create({
        data: {
          senderId,
          receiverId: recipient.id,
          amount,
          currency: 'NGN',
          type: 'send',
          status: shouldFlag ? 'HELD' : 'SUCCESS',
          idempotencyKey,
          reference,
          beforeBalance,
          afterBalance: beforeBalance - total,
          isFlagged: shouldFlag,
          flagReason: reason,
          heldUntil,
          metadata: { description, fee },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'SEND_MONEY',
          userId: senderId,
          actorType: 'user',
          metadata: { recipientTag, amount, fee, reference },
        },
      });

      return {
        success: true,
        reference,
        amount,
        fee,
        recipient: recipientTag,
        transactionId: transaction.id,
      };
    });
  }

  private async handleRequestFlow(
    senderId: string,
    phoneNumber: string,
    amount: number,
    description?: string,
  ) {
    const reference = `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const transaction = await this.prisma.transaction.create({
      data: {
        senderId,
        amount,
        currency: 'NGN',
        type: 'request',
        status: 'PENDING',
        idempotencyKey: reference,
        reference,
        metadata: { phoneNumber, description, isRequestFlow: true },
      },
    });
    return {
      success: true,
      reference,
      requestId: transaction.id,
      recipientPhone: phoneNumber,
      amount,
      description,
      message: 'Payment request created',
    };
  }

  private async handleExternalTransfer(
    senderId: string,
    bankDetails: string,
    amount: number,
    description?: string,
  ) {
    const [accountNumber, bankCode] = bankDetails.split(':');
    if (!accountNumber || !bankCode) {
      throw new BadRequestException('Invalid bank account format');
    }

    let accountName: string;
    try {
      const verify = await this.paystackService.verifyAccount(
        accountNumber,
        bankCode,
      );
      accountName = verify.accountName;
    } catch {
      throw new BadRequestException('Could not verify bank account');
    }

    const senderBalance = await this.prisma.balance.findUnique({
      where: { userId_currency: { userId: senderId, currency: 'NGN' } },
    });

    if (!senderBalance || Number(senderBalance.amount) < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    const fee = amount <= 5000 ? 10 : amount <= 50000 ? 25 : 50;
    const stampDuty = 0;
    const total = amount + fee + stampDuty;
    const idempotencyKey = uuidv4();
    const reference = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const transaction = await this.prisma.transaction.create({
      data: {
        senderId,
        amount,
        currency: 'NGN',
        type: 'external_transfer',
        status: 'PENDING',
        idempotencyKey,
        reference,
        beforeBalance: Number(senderBalance.amount),
        afterBalance: Number(senderBalance.amount) - total,
        metadata: {
          description,
          fee,
          stampDuty,
          accountNumber,
          bankCode,
          accountName,
        },
      },
    });

    try {
      const transferResult = await this.paystackService.initiateTransfer(
        accountNumber,
        bankCode,
        accountName,
        amount,
        reference,
        description,
      );

      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          providerTxId: transferResult.reference,
          status: 'PENDING',
        },
      });

      return {
        success: true,
        reference: transferResult.reference,
        amount,
        fee,
        stampDuty,
        totalDeduction: total,
        accountName,
        transactionId: transaction.id,
      };
    } catch (error) {
      await this.prisma.transaction.delete({ where: { id: transaction.id } });
      throw error;
    }
  }

  private isValidVuraTag(tag: string): boolean {
    return /^[a-zA-Z0-9_]{3,20}$/.test(tag);
  }

  private isValidPhoneNumber(phone: string): boolean {
    return /^\+?[0-9]{10,15}$/.test(phone);
  }

  private isValidBankAccount(details: string): boolean {
    const [accountNumber, bankCode] = details.split(':');
    const isValidAccount =
      accountNumber !== undefined && /^[0-9]{10}$/.test(accountNumber);
    const isValidBank = bankCode !== undefined && /^[0-9]{3}$/.test(bankCode);
    return isValidAccount && isValidBank;
  }

  async getTransactions(userId: string, type?: string, limit = 20, offset = 0) {
    const where = {
      OR: [{ senderId: userId }, { receiverId: userId }],
      ...(type && { type }),
    };
    const transactions = await this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: {
        sender: { select: { vuraTag: true } },
        receiver: { select: { vuraTag: true } },
      },
    });

    return transactions.map((tx) => {
      let counterparty: string | undefined =
        tx.senderId === userId ? tx.receiver?.vuraTag : tx.sender?.vuraTag;
      if (tx.type === 'bill_payment' && !counterparty) {
        const meta = (tx.metadata as Record<string, unknown>) || {};
        const billType = meta.billType as string | undefined;
        counterparty = billType
          ? `${String(billType).charAt(0).toUpperCase()}${String(billType).slice(1)}`
          : 'Bills';
      }
      return {
        id: tx.id,
        type: tx.type,
        amount: Number(tx.amount),
        currency: tx.currency,
        status: tx.status,
        reference: tx.reference,
        createdAt: tx.createdAt,
        counterparty: counterparty ?? '—',
        direction: tx.senderId === userId ? 'sent' : 'received',
      };
    });
  }

  async getBalance(userId: string) {
    const balances = await this.prisma.balance.findMany({
      where: { userId },
    });
    return balances.map((b) => ({
      currency: b.currency,
      amount: Number(b.amount),
    }));
  }

  async lookupTag(
    tag: string,
  ): Promise<{ found: boolean; vuraTag?: string; kycTier?: number }> {
    const searchTag = tag.startsWith('@') ? tag.slice(1) : tag;
    const user = await this.prisma.user.findUnique({
      where: { vuraTag: searchTag },
      select: { vuraTag: true, kycTier: true },
    });
    if (!user) return { found: false };
    return { found: true, vuraTag: user.vuraTag, kycTier: user.kycTier };
  }

  async sendMoney(
    senderId: string,
    recipient: string,
    amount: number,
    description?: string,
    pin?: string,
  ) {
    return this.initiatePayment(senderId, recipient, amount, description, pin);
  }

  /**
   * Resolve bank account name for send-to-bank. Paystack only.
   */
  async verifyBankAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<{ accountName: string }> {
    if (!this.paystackService.isConfigured()) {
      throw new BadRequestException('Send to bank is not available.');
    }
    return await this.paystackService.verifyAccount(accountNumber, bankCode);
  }

  async getAccountBalance(userId: string) {
    const balances = await this.prisma.balance.findMany({
      where: { userId },
    });
    const ngn = balances.find((b) => b.currency === 'NGN');
    const usdt = balances.find((b) => b.currency === 'USDT');
    return {
      ngn: ngn ? Number(ngn.amount) : 0,
      usdt: usdt ? Number(usdt.amount) : 0,
    };
  }

  /**
   * Send to bank (Paystack Transfer). Requires PAYSTACK_SECRET_KEY; set PAYSTACK_TRANSFER_ENABLED=true when Transfer is enabled.
   * Optional idempotencyKey: duplicate requests with same key return cached success without re-debiting.
   */
  async sendToBank(
    senderId: string,
    accountNumber: string,
    bankCode: string,
    accountName: string,
    amount: number,
    description?: string,
    pin?: string,
    idempotencyKey?: string,
  ) {
    if (!this.paystackService.isConfigured()) {
      throw new BadRequestException('Send to bank is not available.');
    }

    const key = idempotencyKey?.trim() || uuidv4();
    const existing = await this.prisma.transaction.findFirst({
      where: { idempotencyKey: key, senderId },
    });
    if (existing) {
      if (existing.status === 'SUCCESS') {
        const meta = (existing.metadata as Record<string, unknown>) || {};
        const fee = (meta.fee as number) ?? 0;
        const amt = Number(existing.amount);
        return {
          success: true,
          reference: existing.reference,
          amount: amt,
          fee,
          totalDeduction: amt + fee,
          accountName: (meta.accountName as string) || '',
          transactionId: existing.id,
        };
      }
      if (existing.status === 'PENDING') {
        throw new BadRequestException('Transfer in progress. Please wait.');
      }
      throw new BadRequestException(
        'This transfer previously failed. Please try again with a new transfer.',
      );
    }

    const nuban = accountNumber.replace(/\D/g, '');
    if (nuban.length !== 10) {
      throw new BadRequestException(
        'Invalid account number (must be 10 digits).',
      );
    }
    if (!bankCode?.trim()) {
      throw new BadRequestException('Bank is required.');
    }
    if (!accountName?.trim()) {
      throw new BadRequestException(
        'Account name is required. Verify the account number first.',
      );
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Invalid amount.');
    }

    await this.limitsService.checkSendLimit(
      senderId,
      new Decimal(amount),
      'NGN',
    );
    await this.holdsService.checkHeldFunds(senderId, new Decimal(amount));

    if (pin) {
      const user = await this.prisma.user.findUnique({
        where: { id: senderId },
        select: { hashedPin: true },
      });
      if (!user?.hashedPin) {
        throw new UnauthorizedException('Set your PIN in Settings.');
      }
      const pinValid = await bcrypt.compare(pin, user.hashedPin);
      if (!pinValid) {
        throw new UnauthorizedException('Invalid PIN');
      }
    }

    const senderBalance = await this.prisma.balance.findUnique({
      where: { userId_currency: { userId: senderId, currency: 'NGN' } },
    });
    if (!senderBalance) {
      throw new BadRequestException('Insufficient balance.');
    }

    const fee = amount <= 5000 ? 10 : amount <= 50000 ? 25 : 50;
    const total = amount + fee;
    const beforeBalance = Number(senderBalance.amount);
    if (beforeBalance < total) {
      throw new BadRequestException('Insufficient balance.');
    }

    const reference = `VUR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const transaction = await this.prisma.$transaction(async (tx) => {
      const t = await tx.transaction.create({
        data: {
          senderId,
          amount,
          currency: 'NGN',
          type: 'external_transfer',
          status: 'PENDING',
          idempotencyKey: key,
          reference,
          beforeBalance: beforeBalance,
          afterBalance: beforeBalance - total,
          metadata: {
            description,
            fee,
            accountNumber: nuban,
            bankCode,
            accountName,
            provider: 'paystack',
          },
        },
      });

      await tx.balance.update({
        where: { id: senderBalance.id },
        data: {
          amount: beforeBalance - total,
          lastUpdatedBy: 'user',
        },
      });

      return t;
    });

    try {
      const result = await this.paystackService.initiateTransfer(
        nuban,
        bankCode,
        accountName,
        amount,
        reference,
        description || 'Vura transfer',
      );

      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          providerTxId: result.reference || reference,
          status: 'PENDING',
        },
      });

      return {
        success: true,
        reference: result.reference || reference,
        amount,
        fee,
        totalDeduction: total,
        accountName,
        transactionId: transaction.id,
      };
    } catch (err) {
      await this.prisma.$transaction(async (tx) => {
        await tx.balance.update({
          where: { id: senderBalance.id },
          data: {
            amount: beforeBalance,
            lastUpdatedBy: 'user',
          },
        });
        await tx.transaction.update({
          where: { id: transaction.id },
          data: { status: 'FAILED' },
        });
      });
      throw err;
    }
  }
}
