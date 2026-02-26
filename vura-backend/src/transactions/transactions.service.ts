import { Injectable, BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LimitsService } from '../limits/limits.service';
import { HoldsService } from '../holds/holds.service';
import { PaystackService } from '../services/paystack.service';
import { MonnifyService } from '../services/monnify.service';
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
    private monnifyService: MonnifyService,
  ) {}

  // Main payment router function
  async initiatePayment(
    senderId: string,
    recipient: string,
    amount: number,
    description?: string,
    pin?: string,
  ) {
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

    // Route to appropriate handler based on recipient type
    if (recipient.startsWith('@') || this.isValidVuraTag(recipient)) {
      return await this.handleInternalTransfer(senderId, recipient, amount, description);
    } else if (this.isValidPhoneNumber(recipient)) {
      return await this.handleRequestFlow(senderId, recipient, amount, description);
    } else if (this.isValidBankAccount(recipient)) {
      return await this.handleExternalTransfer(senderId, recipient, amount, description);
    } else {
      throw new BadRequestException('Invalid recipient format');
    }
  }

  // Handle internal Vura-to-Vura transfers
  private async handleInternalTransfer(
    senderId: string,
    recipientTag: string,
    amount: number,
    description?: string,
  ) {
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
    return await this.prisma.$transaction(async (tx) => {
      // Debit sender
      const beforeBalance = Number(senderBalance.amount);
      const senderUpdate = await tx.balance.update({
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
      const recipientUpdate = await tx.balance.upsert({
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

      // Create audit logs
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

// Handle QR/request flow with Monnify
  private async handleRequestFlow(
    senderId: string,
    phoneNumber: string,
    amount: number,
    description?: string,
  ) {
    // For request flow, we create a pending transaction
    // The recipient will claim it using their phone number
    // For now, we'll return a reserved account creation request
    
    // Generate a temporary reference for the request
    const reference = `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create a pending transaction that the recipient can claim
    const transaction = await this.prisma.transaction.create({
      data: {
        senderId,
        amount,
        currency: 'NGN',
        type: 'request',
        status: 'PENDING',
        idempotencyKey: reference,
        reference,
        metadata: { 
          phoneNumber, 
          description,
          isRequestFlow: true 
        },
      },
    });

    return {
      success: true,
      reference,
      requestId: transaction.id,
      recipientPhone: phoneNumber,
      amount,
      description,
      message: 'Payment request created. Recipient can claim using their phone number.',
    };
  }

  // Handle external bank transfers
  private async handleExternalTransfer(
    senderId: string,
    bankDetails: string,
    amount: number,
    description?: string,
  ) {
    // Parse bank details (format: "1234567890:044")
    const [accountNumber, bankCode] = bankDetails.split(':');

    if (!accountNumber || !bankCode) {
      throw new BadRequestException('Invalid bank account format');
    }

    // Verify account with Paystack
    const accountVerification = await this.paystackService.verifyAccount(
      accountNumber,
      bankCode,
    );

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

    // Set transaction to PENDING immediately
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
        metadata: { description, fee, accountNumber, bankCode, accountName: accountVerification.accountName },
      },
    });

    try {
      // Initiate transfer with Paystack (amount in kobo)
      const paystackResponse = await this.paystackService.initiateTransfer(
        accountNumber,
        bankCode,
        accountVerification.accountName,
        amount,
        reference,
        description,
      );

      // Update transaction with Paystack reference
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { providerTxId: paystackResponse.reference, status: 'PENDING' },
      });

      return {
        success: true,
        reference: paystackResponse.reference,
        amount,
        fee,
        accountName: accountVerification.accountName,
        transactionId: transaction.id,
      };
    } catch (error) {
      // Rollback transaction if Paystack fails
      await this.prisma.transaction.delete({ where: { id: transaction.id } });
      throw error;
    }
  }

  // Helper methods for validation
  private isValidVuraTag(tag: string): boolean {
    return /^[a-zA-Z0-9_]{3,20}$/.test(tag);
  }

  private isValidPhoneNumber(phone: string): boolean {
    return /^\+?[0-9]{10,15}$/.test(phone);
  }

  private isValidBankAccount(details: string): boolean {
    const [accountNumber, bankCode] = details.split(':');
    const isValidAccount = accountNumber !== undefined && /^[0-9]{10}$/.test(accountNumber);
    const isValidBank = bankCode !== undefined && /^[0-9]{3}$/.test(bankCode);
    return isValidAccount && isValidBank;
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

  async lookupTag(tag: string): Promise<{ found: boolean; vuraTag?: string; kycTier?: number }> {
    // Remove @ if present
    const searchTag = tag.startsWith('@') ? tag.slice(1) : tag;

    const user = await this.prisma.user.findUnique({
      where: { vuraTag: searchTag },
      select: { vuraTag: true, kycTier: true },
    });

    if (!user) {
      return { found: false };
    }

    return { found: true, vuraTag: user.vuraTag, kycTier: user.kycTier };
  }

  // Alias for initiatePayment - used by BillsService for system transactions
  async sendMoney(
    senderId: string,
    recipient: string,
    amount: number,
    description?: string,
    pin?: string,
  ) {
    return this.initiatePayment(senderId, recipient, amount, description, pin);
  }

  // Get account balance for dashboard
  async getAccountBalance(userId: string) {
    const balances = await this.prisma.balance.findMany({
      where: { userId },
    });

    const ngn = balances.find(b => b.currency === 'NGN');
    const usdt = balances.find(b => b.currency === 'USDT');

    return {
      ngn: ngn ? Number(ngn.amount) : 0,
      usdt: usdt ? Number(usdt.amount) : 0,
    };
  }
}
