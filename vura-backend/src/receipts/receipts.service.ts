import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import QRCode from 'qrcode';

import * as crypto from 'crypto';

@Injectable()
export class ReceiptsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate receipt data for a transaction
   */
  async generateReceipt(
    transactionId: string,
    userId: string,
  ): Promise<{
    receiptUrl: string;
    qrCodeDataUrl: string;
    transaction: any;
  }> {
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        id: transactionId,
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: {
        sender: {
          select: { vuraTag: true },
        },
        receiver: {
          select: { vuraTag: true },
        },
      },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // Generate verification hash
    const verificationHash = crypto
      .createHash('sha256')
      .update(`${transaction.id}-${transaction.createdAt.toISOString()}`)
      .digest('hex')
      .substring(0, 16);

    // Generate QR code
    const qrData = JSON.stringify({
      txId: transaction.id,
      hash: verificationHash,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
    });

    const qrCodeDataUrl = await QRCode.toDataURL(qrData);

    // Store receipt reference
    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        metadata: {
          ...((transaction.metadata as object) || {}),
          receiptGeneratedAt: new Date().toISOString(),
          receiptHash: verificationHash,
        },
      },
    });

    return {
      receiptUrl: `/api/receipts/${transactionId}/download`,
      qrCodeDataUrl,
      transaction: {
        id: transaction.id,
        type: transaction.type,
        amount: Number(transaction.amount),
        currency: transaction.currency,
        status: transaction.status,
        senderTag: transaction.sender?.vuraTag || 'External',
        receiverTag: transaction.receiver?.vuraTag || 'External',
        reference: transaction.reference,
        createdAt: transaction.createdAt,
        verificationHash,
      },
    };
  }

  /**
   * Verify receipt authenticity
   */
  async verifyReceipt(txId: string, hash: string): Promise<boolean> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: txId },
    });

    if (!transaction) {
      return false;
    }

    const expectedHash = crypto
      .createHash('sha256')
      .update(`${transaction.id}-${transaction.createdAt.toISOString()}`)
      .digest('hex')
      .substring(0, 16);

    return hash === expectedHash;
  }
}
