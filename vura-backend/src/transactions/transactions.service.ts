import { Injectable, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LimitsService } from '../limits/limits.service';
import { HoldsService } from '../holds/holds.service';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import Decimal from 'decimal.js';

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private limitsService: LimitsService,
    private holdsService: HoldsService,
  ) {}



  async sendMoney(senderId: string, recipientTag: string, amount: number, description?: string, pin?: string) {
    // Check transaction limits first
    await this.limitsService.checkSendLimit(senderId, new Decimal(amount), 'NGN');

    // Check held funds (prevent spending held money)
    await this.holdsService.checkHeldFunds(senderId, new Decimal(amount));

    // Verify PIN if provided

    if (pin) {
      const user = await this.prisma.user.findUnique({ where: { id: senderId } });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const pinValid = await bcrypt.compare(pin, user.pinHash || '');
      if (!pinValid) {
        throw new UnauthorizedException('Invalid PIN');
      }
    }

    // Find recipient

    const recipient = await this.prisma.user.findUnique({
      where: { vuraTag: recipientTag },
    });

    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    if (recipient.id === senderId) {
      throw new BadRequestException('Cannot send money to yourself');
    }

    // Get sender's NGN balance
    const senderBalance = await this.prisma.balance.findUnique({
      where: { userId_currency: { userId: senderId, currency: 'NGN' } },
    });

    if (!senderBalance || Number(senderBalance.amount) < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    // Calculate fee (0.5%)
    const fee = Math.max(10, amount * 0.005);
    const total = amount + fee;

    // Generate idempotency key
    const idempotencyKey = uuidv4();
    const reference = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Use transaction for atomic operation
    await this.prisma.$transaction(async (tx) => {
      // Debit sender
      const beforeBalance = Number(senderBalance.amount);
      await tx.balance.update({
        where: { id: senderBalance.id },
        data: {
          amount: beforeBalance - total,
          lastUpdatedBy: 'user',
        },
      });

      // Credit recipient
      const recipientBalance = await tx.balance.findUnique({
        where: { userId_currency: { userId: recipient.id, currency: 'NGN' } },
      });

      const recipientBefore = Number(recipientBalance?.amount || 0);
      await tx.balance.upsert({
        where: { id: recipientBalance?.id },
        create: { userId: recipient.id, currency: 'NGN', amount },
        update: { amount: recipientBefore + amount, lastUpdatedBy: 'user' },
      });

      // Check if transaction should be flagged
      const { shouldFlag, reason } = await this.holdsService.shouldFlagTransaction(
        senderId,
        new Decimal(amount),
        1, // Default KYC tier, should get from user
      );

      const heldUntil = shouldFlag ? this.holdsService.calculateHoldExpiry() : null;

      // Create transaction record
      await tx.transaction.create({
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


      // Create audit logs
      await tx.auditLog.create({
        data: {
          action: 'SEND_MONEY',
          userId: senderId,
          actorType: 'user',
          metadata: { recipientTag, amount, fee, reference },
        },
      });
    });

    return {
      success: true,
      reference,
      amount,
      fee,
      recipient: recipientTag,
    };
  }

  async getTransactions(userId: string, type?: string, limit = 20, offset = 0) {
    const where = {
      OR: [
        { senderId: userId },
        { receiverId: userId },
      ],
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
      counterparty: tx.senderId === userId
        ? tx.receiver?.vuraTag
        : tx.sender?.vuraTag,
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

  async lookupTag(tag: string) {
    // Remove @ if present
    const searchTag = tag.startsWith('@') ? tag.slice(1) : tag;

    const user = await this.prisma.user.findUnique({
      where: { vuraTag: searchTag },
      select: { vuraTag: true, kycTier: true },
    });

    return user ? { found: true, vuraTag: user.vuraTag, kycTier: user.kycTier } : { found: false };
  }
}
