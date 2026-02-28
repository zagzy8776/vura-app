import { Controller, Post, Body, Headers, HttpCode, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { FlutterwaveService } from '../services/flutterwave.service';

@Controller('webhooks/flutterwave')
export class FlutterwaveWebhookController {
  private readonly logger = new Logger(FlutterwaveWebhookController.name);
  private readonly secretHash: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private flutterwaveService: FlutterwaveService,
  ) {
    // This is your Flutterwave webhook secret hash
    this.secretHash = this.configService.get<string>('FLUTTERWAVE_SECRET_HASH') || '';
  }

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Body() payload: any,
    @Headers('verif-hash') verifHash: string,
  ) {
    // 1. Verify the webhook signature
    if (!verifHash || verifHash !== this.secretHash) {
      this.logger.warn('Invalid webhook signature');
      throw new BadRequestException('Invalid signature');
    }

    const eventType = payload.event;
    this.logger.log(`Received Flutterwave webhook: ${eventType}`);

    switch (eventType) {
      case 'charge.completed':
        await this.handleChargeCompleted(payload.data);
        break;
      
      case 'transfer.completed':
        await this.handleTransferCompleted(payload.data);
        break;
      
      case 'transfer.failed':
        await this.handleTransferFailed(payload.data);
        break;
      
      default:
        this.logger.log(`Unhandled event type: ${eventType}`);
    }

    return { status: 'success' };
  }

  /**
   * Handle successful virtual account charge
   * This is when someone sends money to a Vura virtual account
   */
  private async handleChargeCompleted(data: any) {
    const { amount, currency, tx_ref, flw_ref, customer } = data;
    
    // Extract user ID from the transaction reference (format: VURA-{userId}-{timestamp})
    const userId = tx_ref?.replace('VURA-', '')?.split('-')[0];
    
    if (!userId) {
      this.logger.error(`Could not extract userId from tx_ref: ${tx_ref}`);
      return;
    }

    this.logger.log(`Processing deposit: ${amount} ${currency} for user ${userId}`);

    // Find the user
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      this.logger.error(`User not found: ${userId}`);
      return;
    }

    // Calculate fee (1.5% for inflow)
    const fee = amount * 0.015;
    const netAmount = amount - fee;

    // Get or create balance
    const balance = await this.prisma.balance.findUnique({
      where: { userId_currency: { userId, currency: 'NGN' } },
    });

    if (balance) {
      // Update existing balance
      await this.prisma.balance.update({
        where: { id: balance.id },
        data: {
          amount: Number(balance.amount) + netAmount,
          lastUpdatedBy: 'flutterwave',
        },
      });
    } else {
      // Create new balance
      await this.prisma.balance.create({
        data: {
          userId,
          currency: 'NGN',
          amount: netAmount,
          lastUpdatedBy: 'flutterwave',
        },
      });
    }

    // Create transaction record
    await this.prisma.transaction.create({
      data: {
        receiverId: userId,
        amount,
        currency: 'NGN',
        type: 'deposit',
        status: 'SUCCESS',
        providerTxId: flw_ref,
        idempotencyKey: tx_ref,
        reference: tx_ref,
        metadata: {
          provider: 'flutterwave',
          customerEmail: customer?.email,
          fee,
          netAmount,
        },
      },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'DEPOSIT_VIA_VIRTUAL_ACCOUNT',
        userId,
        actorType: 'system',
        metadata: {
          amount,
          fee,
          netAmount,
          txRef: tx_ref,
          flwRef: flw_ref,
        },
      },
    });

    this.logger.log(`Successfully credited ${netAmount} NGN to user ${userId}`);
  }

  /**
   * Handle successful outgoing transfer
   */
  private async handleTransferCompleted(data: any) {
    const { amount, currency, tx_ref, flw_ref } = data;
    
    this.logger.log(`Transfer completed: ${tx_ref}, Amount: ${amount}`);

    // Update transaction status
    await this.prisma.transaction.updateMany({
      where: { reference: tx_ref },
      data: {
        status: 'SUCCESS',
        providerTxId: flw_ref,
      },
    });
  }

  /**
   * Handle failed transfer
   */
  private async handleTransferFailed(data: any) {
    const { amount, currency, tx_ref, flw_ref } = data;
    
    this.logger.log(`Transfer failed: ${tx_ref}, Amount: ${amount}`);

    // Find the transaction
    const transaction = await this.prisma.transaction.findFirst({
      where: { reference: tx_ref },
    });

    if (transaction && transaction.senderId) {
      // Refund the sender (they were charged but transfer failed)
      const senderBalance = await this.prisma.balance.findUnique({
        where: { userId_currency: { userId: transaction.senderId, currency: 'NGN' } },
      });

      if (senderBalance) {
        await this.prisma.balance.update({
          where: { id: senderBalance.id },
          data: {
            amount: Number(senderBalance.amount) + amount,
            lastUpdatedBy: 'flutterwave_refund',
          },
        });
      }

      // Update transaction status
      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'FAILED',
          providerTxId: flw_ref,
          metadata: { ...transaction.metadata, failureReason: 'transfer_failed' },
        },
      });

      // Create audit log
      await this.prisma.auditLog.create({
        data: {
          action: 'TRANSFER_FAILED_REFUND',
          userId: transaction.senderId,
          actorType: 'system',
          metadata: { amount, txRef: tx_ref, flwRef: flw_ref },
        },
      });
    }
  }
}
