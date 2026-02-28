import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LimitsService } from '../limits/limits.service';
import { HoldsService } from '../holds/holds.service';
import { FlutterwaveService } from '../services/flutterwave.service';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import Decimal from 'decimal.js';

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private limitsService: LimitsService,
    private holdsService: HoldsService,
    private flutterwaveService: FlutterwaveService,
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

    const fee = Math.max(10, amount * 0.005);
    const total = amount + fee;
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
      await tx.balance.upsert({
        where: { id: recipientBalance?.id },
        create: { userId: recipient.id, currency: 'NGN', amount },
        update: { amount: recipientBefore + amount, lastUpdatedBy: 'user' },
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

    const accountVerification = await this.flutterwaveService.verifyAccount(
      accountNumber,
      bankCode,
    );

    const senderBalance = await this.prisma.balance.findUnique({
      where: { userId_currency: { userId: senderId, currency: 'NGN' } },
    });

    if (!senderBalance || Number(senderBalance.amount) < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    const fee = Math.max(10, amount * 0.005);
    const total = amount + fee;
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
          accountNumber,
          bankCode,
          accountName: accountVerification.accountName,
        },
      },
    });

    try {
      const flutterwaveResponse =
        await this.flutterwaveService.initiateTransfer(
          accountNumber,
          bankCode,
          accountVerification.accountName,
          amount,
          reference,
          description,
        );

      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          providerTxId: flutterwaveResponse.reference,
          status: 'PENDING',
        },
      });

      return {
        success: true,
        reference: flutterwaveResponse.reference,
        amount,
        fee,
        accountName: accountVerification.accountName,
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

    return transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amount: Number(tx.amount),
      currency: tx.currency,
      status: tx.status,
      reference: tx.reference,
      createdAt: tx.createdAt,
      counterparty:
        tx.senderId === userId ? tx.receiver?.vuraTag : tx.sender?.vuraTag,
      direction: tx.senderId === userId ? 'sent' : 'received',
    }));
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
}
