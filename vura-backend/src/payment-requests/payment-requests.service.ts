import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { randomBytes } from 'crypto';

@Injectable()
export class PaymentRequestsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a payment request
   * Requester asks payer for money
   */
  async createRequest(
    requesterId: string,
    payerVuraTag: string,
    amount: number,
    description?: string,
    expiresInMinutes: number = 60,
  ) {
    // Find payer by vuraTag
    const payer = await this.prisma.user.findUnique({
      where: { vuraTag: payerVuraTag },
      select: { id: true, vuraTag: true, kycTier: true },
    });

    if (!payer) {
      throw new NotFoundException('Payer not found');
    }

    if (payer.id === requesterId) {
      throw new BadRequestException('Cannot request money from yourself');
    }

    // Check requester KYC
    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
      select: { vuraTag: true, kycTier: true },
    });

    if (!requester || requester.kycTier < 1) {
      throw new BadRequestException('Complete KYC to request payments');
    }

    // Generate unique reference
    const reference = this.generateReference();
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // Create payment request
    const request = await this.prisma.paymentRequest.create({
      data: {
        requesterId,
        payerId: payer.id,
        amount: new Decimal(amount),
        currency: 'NGN',
        description: description || 'Payment Request',
        reference,
        expiresAt,
        status: 'pending',
        metadata: {
          requesterVuraTag: requester.vuraTag,
          payerVuraTag: payer.vuraTag,
        },
      },
    });

    // TODO: Send notification to payer (push/email)

    return {
      success: true,
      request: {
        id: request.id,
        reference: request.reference,
        amount: Number(request.amount),
        description: request.description,
        status: request.status,
        expiresAt: request.expiresAt,
        payerVuraTag: payer.vuraTag,
      },
      message: `Payment request sent to @${payer.vuraTag}`,
    };
  }

  /**
   * Get pending requests for a user (as payer)
   */
  async getPendingRequests(userId: string) {
    const requests = await this.prisma.paymentRequest.findMany({
      where: {
        payerId: userId,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        requester: {
          select: {
            vuraTag: true,
            kycTier: true,
          },
        },
      },
    });

    return requests.map((req) => ({
      id: req.id,
      reference: req.reference,
      amount: Number(req.amount),
      description: req.description,
      requesterVuraTag: req.requester.vuraTag,
      requesterKycTier: req.requester.kycTier,
      createdAt: req.createdAt,
      expiresAt: req.expiresAt,
    }));
  }

  /**
   * Get requests made by user (as requester)
   */
  async getMyRequests(userId: string, status?: string) {
    const where: any = { requesterId: userId };
    if (status) {
      where.status = status;
    }

    const requests = await this.prisma.paymentRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        payer: {
          select: {
            vuraTag: true,
          },
        },
      },
    });

    return requests.map((req) => ({
      id: req.id,
      reference: req.reference,
      amount: Number(req.amount),
      description: req.description,
      status: req.status,
      payerVuraTag: req.payer?.vuraTag || null,
      createdAt: req.createdAt,
      expiresAt: req.expiresAt,
      completedAt: req.completedAt,
    }));
  }

  /**
   * Accept a payment request
   * Payer accepts and money is transferred instantly
   */
  async acceptRequest(userId: string, requestId: string, pin: string) {
    // Get request
    const request = await this.prisma.paymentRequest.findFirst({
      where: {
        id: requestId,
        payerId: userId,
        status: 'pending',
      },
      include: {
        requester: {
          select: {
            id: true,
            vuraTag: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Payment request not found or already processed');
    }

    if (new Date() > request.expiresAt) {
      // Expire the request
      await this.prisma.paymentRequest.update({
        where: { id: requestId },
        data: { status: 'expired' },
      });
      throw new BadRequestException('Payment request has expired');
    }

    // Return data for transaction processing
    return {
      success: true,
      request: {
        id: request.id,
        reference: request.reference,
        recipientId: request.requester.id,
        recipientVuraTag: request.requester.vuraTag,
        amount: Number(request.amount),
        description: request.description,
      },
    };
  }

  /**
   * Decline a payment request
   */
  async declineRequest(userId: string, requestId: string) {
    const request = await this.prisma.paymentRequest.findFirst({
      where: {
        id: requestId,
        payerId: userId,
        status: 'pending',
      },
    });

    if (!request) {
      throw new NotFoundException('Payment request not found or already processed');
    }

    await this.prisma.paymentRequest.update({
      where: { id: requestId },
      data: { status: 'declined' },
    });

    return {
      success: true,
      message: 'Payment request declined',
    };
  }

  /**
   * Mark request as completed (called after successful transaction)
   */
  async completeRequest(requestId: string) {
    await this.prisma.paymentRequest.update({
      where: { id: requestId },
      data: {
        status: 'accepted',
        completedAt: new Date(),
      },
    });
  }

  /**
   * Generate unique reference
   */
  private generateReference(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = randomBytes(4).toString('hex').toUpperCase();
    return `REQ-${timestamp}-${random}`;
  }
}
