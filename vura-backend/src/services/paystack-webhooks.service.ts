import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as crypto from 'crypto';

export interface PaystackWebhookPayload {
  event: string;
  data: {
    id: number;
    reference: string;
    status: string;
    amount: number;
    paid_at: string;
    paidAt: string;
    customer: {
      id: number;
      email: string;
      customer_code: string;
      first_name: string;
      last_name: string;
    };
    metadata?: {
      userId?: string;
      transactionId?: string;
    };
  };
}

@Injectable()
export class PaystackWebhooksService {
  private readonly logger = new Logger(PaystackWebhooksService.name);
  private readonly secret = process.env.PAYSTACK_WEBHOOK_SECRET || '';

  constructor(private prisma: PrismaService) {}

  /**
   * Verify Paystack webhook signature
   */
  verifySignature(payload: string, signature: string): boolean {
    if (!this.secret) {
      this.logger.warn('PAYSTACK_WEBHOOK_SECRET not configured');
      return false;
    }

    const hash = crypto
      .createHmac('sha512', this.secret)
      .update(payload)
      .digest('hex');
    return hash === signature;
  }

  /**
   * Handle charge.success event
   */
  async handleChargeSuccess(
    data: PaystackWebhookPayload['data'],
  ): Promise<void> {
    try {
      this.logger.log(
        `Processing successful charge: Reference=${data.reference}, Amount=${data.amount}`,
      );

      const userId = data.metadata?.userId;
      const transactionId = data.metadata?.transactionId;

      if (!userId || !transactionId) {
        this.logger.warn(
          `Webhook missing userId or transactionId: ${data.reference}`,
        );
        return;
      }

      // Find or create transaction record
      const transaction = await this.prisma.transaction.findUnique({
        where: { id: transactionId },
      });

      if (!transaction) {
        this.logger.warn(`Transaction not found: ${transactionId}`);
        return;
      }

      if (transaction.status === 'completed') {
        this.logger.log(`Transaction already completed: ${transactionId}`);
        return; // Idempotency
      }

      // Update transaction status to completed
      await this.prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'COMPLETED',
          providerTxId: data.reference,
          externalReference: `paystack_${data.id}`,
          metadata: {
            ...(typeof transaction.metadata === 'object' &&
            transaction.metadata !== null
              ? transaction.metadata
              : {}),
            paystackReference: data.reference,
            paystackId: data.id,
            chargedAmount: data.amount,
            chargedAt: data.paid_at || data.paidAt,
          },
        },
      });

      // Update user balance
      const amountInNGN = data.amount / 100; // Paystack uses kobo
      await this.prisma.balance.update({
        where: { userId_currency: { userId, currency: 'NGN' } },
        data: {
          amount: {
            increment: amountInNGN,
          },
          lastUpdatedBy: 'paystack_webhook',
          updatedAt: new Date(),
        },
      });

      // Log audit
      await this.prisma.auditLog.create({
        data: {
          action: 'CHARGE_SUCCESS',
          userId,
          actorType: 'system',
          metadata: {
            transactionId,
            paystackReference: data.reference,
            amountNGN: amountInNGN,
            customerEmail: data.customer.email,
          },
        },
      });

      this.logger.log(
        `Successfully processed charge for user ${userId}: ₦${amountInNGN}`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing charge.success webhook: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * Handle charge.failed event
   */
  async handleChargeFailed(
    data: PaystackWebhookPayload['data'],
  ): Promise<void> {
    try {
      this.logger.log(`Processing failed charge: Reference=${data.reference}`);

      const transactionId = data.metadata?.transactionId;
      const userId = data.metadata?.userId;

      if (!transactionId) {
        this.logger.warn(`Webhook missing transactionId: ${data.reference}`);
        return;
      }

      // Update transaction to failed
      await this.prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'FAILED',
          providerTxId: data.reference,
          externalReference: `paystack_${data.id}`,
          metadata: {
            failureReason: 'Charge declined',
            paystackReference: data.reference,
          },
        },
      });

      if (userId) {
        await this.prisma.auditLog.create({
          data: {
            action: 'CHARGE_FAILED',
            userId,
            actorType: 'system',
            metadata: {
              transactionId,
              paystackReference: data.reference,
              reason: 'Charge declined',
            },
          },
        });
      }

      this.logger.log(`Charge failed for transaction ${transactionId}`);
    } catch (error) {
      this.logger.error(
        `Error processing charge.failed webhook: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * Process webhook based on event type
   */
  async processWebhook(
    event: string,
    data: PaystackWebhookPayload['data'],
  ): Promise<void> {
    switch (event) {
      case 'charge.success':
        await this.handleChargeSuccess(data);
        break;
      case 'charge.failed':
        await this.handleChargeFailed(data);
        break;
      default:
        this.logger.debug(`Unhandled webhook event: ${event}`);
    }
  }
}
