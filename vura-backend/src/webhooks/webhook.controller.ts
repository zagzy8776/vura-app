/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Post,
  Headers,
  Body,
  BadRequestException,
  UnauthorizedException,
  Logger,
  Req,
  HttpCode,
} from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { LimitsService } from '../limits/limits.service';
import { CloudinaryService } from '../services/cloudinary.service';
import Decimal from 'decimal.js';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly monnifySecret: string;
  private readonly paystackSecret: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private limitsService: LimitsService,
    private cloudinary: CloudinaryService,
  ) {
    this.monnifySecret = this.config.get('MONNIFY_WEBHOOK_SECRET') || '';
    // Paystack signs webhooks with the secret key; no separate webhook secret is issued
    this.paystackSecret =
      this.config.get('PAYSTACK_WEBHOOK_SECRET') ||
      this.config.get('PAYSTACK_SECRET_KEY') ||
      '';
  }

  // ============================================
  // MONNIFY WEBHOOK
  // ============================================

  /**
   * Handle Monnify virtual account webhooks
   * Monnify handles fiat deposits via virtual accounts
   */
  @Post('monnify')
  @HttpCode(200)
  async handleMonnifyWebhook(
    @Body() payload: any,
    @Headers('x-monnify-signature') signature: string,
    @Req() req: Request,
  ) {
    // 1. Verify webhook signature
    const rawBody = JSON.stringify(payload);
    if (!this.verifyMonnifySignature(rawBody, signature)) {
      this.logger.error('Invalid Monnify webhook signature', { ip: req.ip });
      throw new UnauthorizedException('Invalid signature');
    }

    // 2. Extract event data
    const eventType = payload.eventType || payload.event;
    const reference = payload.reference || payload.paymentReference;
    const amount = payload.amount;

    if (!reference || !amount) {
      throw new BadRequestException('Missing reference or amount');
    }

    // 3. Check idempotency
    const existing = await this.prisma.processedWebhook.findUnique({
      where: { providerTxId: reference },
    });

    if (existing) {
      return { status: 'already_processed' };
    }

    // 4. Log webhook
    await this.prisma.processedWebhook.create({
      data: {
        provider: 'monnify',
        providerTxId: reference,
        eventType,
        rawPayload: payload,
        signatureValid: true,
      },
    });

    // 5. Process based on event type
    if (eventType === 'SUCCESS' || eventType === 'successful') {
      return this.handleMonnifySuccessfulPayment(payload, req);
    }

    if (eventType === 'FAILED' || eventType === 'failed') {
      return this.handleMonnifyFailedPayment(payload);
    }

    return { status: 'ignored', reason: 'unknown_event_type' };
  }

  private async handleMonnifySuccessfulPayment(payload: any, req: Request) {
    const reference = payload.reference;
    const amount = new Decimal(payload.amount);
    const customerName = payload.customerName;
    const accountNumber = payload.accountNumber;

    // Find user by virtual account
    const user = await this.prisma.user.findFirst({
      where: {
        beneficiaries: {
          some: {
            accountNumber,
            type: 'bank',
          },
        },
      },
    });

    if (!user) {
      this.logger.warn('Monnify: User not found for account', {
        accountNumber,
        reference,
      });
      return { status: 'user_not_found' };
    }

    // Check for duplicate transaction
    const existingTx = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: reference },
    });

    if (existingTx) {
      return { status: 'already_processed' };
    }

    try {
      await this.limitsService.checkMaxBalance(user.id, amount, 'NGN');
    } catch {
      this.logger.warn(
        'Monnify deposit would exceed max balance limit; crediting anyway and flagging',
        {
          userId: user.id,
          reference,
          amount: amount.toString(),
        },
      );
      await this.prisma.auditLog.create({
        data: {
          action: 'BALANCE_LIMIT_EXCEEDED_CREDIT',
          userId: user.id,
          actorType: 'system',
          metadata: {
            reference,
            amount: amount.toString(),
            provider: 'monnify',
          } as any,
        },
      });
    }

    // Atomic credit transaction
    await this.prisma.$transaction(async (tx) => {
      const balance = await tx.balance.findUnique({
        where: {
          userId_currency: {
            userId: user.id,
            currency: 'NGN',
          },
        },
      });

      const beforeBalance = balance
        ? new Decimal(balance.amount.toString())
        : new Decimal(0);
      const afterBalance = beforeBalance.add(amount);

      // Credit balance
      await tx.balance.upsert({
        where: {
          userId_currency: {
            userId: user.id,
            currency: 'NGN',
          },
        },
        create: {
          userId: user.id,
          currency: 'NGN',
          amount: afterBalance.toNumber(),
          lastUpdatedBy: 'monnify_deposit',
        },
        update: {
          amount: afterBalance.toNumber(),
          lastUpdatedBy: 'monnify_deposit',
        },
      });

      // Create transaction record
      await tx.transaction.create({
        data: {
          receiverId: user.id,
          amount: amount.toNumber(),
          currency: 'NGN',
          type: 'deposit',
          status: 'SUCCESS',
          idempotencyKey: reference,
          providerTxId: reference,
          beforeBalance: beforeBalance.toNumber(),
          afterBalance: afterBalance.toNumber(),
          reference: `MONNIFY-${reference}`,
          metadata: {
            provider: 'monnify',
            customerName,
            accountNumber,
          } as any,
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          action: 'MONNIFY_DEPOSIT_RECEIVED',
          userId: user.id,
          actorType: 'system',
          metadata: {
            reference,
            amount: amount.toString(),
            customerName,
            accountNumber,
          } as any,
          ipAddress: req.ip || undefined,
        },
      });
    });

    this.logger.log(
      `Monnify: Credited ${amount.toString()} NGN to user ${user.id}`,
      { reference },
    );

    return { status: 'success', amount: amount.toString() };
  }

  private handleMonnifyFailedPayment(payload: any) {
    const reference = payload.reference;

    this.logger.warn('Monnify payment failed', { reference });

    return { status: 'failed', reference };
  }

  // ============================================
  // PAYSTACK WEBHOOK
  // ============================================

  /**
   * Handle Paystack webhook for payouts
   * Paystack handles fiat withdrawals
   */
  @Post('paystack')
  @HttpCode(200)
  async handlePaystackWebhook(
    @Body() payload: any,
    @Headers('x-paystack-signature') signature: string,
    @Req() req: Request,
  ) {
    // 1. Verify webhook signature
    const rawBody = JSON.stringify(payload);
    if (!this.verifyPaystackSignature(rawBody, signature)) {
      this.logger.error('Invalid Paystack webhook signature', { ip: req.ip });
      throw new UnauthorizedException('Invalid signature');
    }

    // 2. Extract event data
    const event = payload.event;
    const data = payload.data || {};
    const reference = data.reference;

    if (!reference) {
      throw new BadRequestException('Missing reference');
    }

    // 3. Check idempotency
    const existing = await this.prisma.processedWebhook.findUnique({
      where: { providerTxId: reference },
    });

    if (existing) {
      return { status: 'already_processed' };
    }

    // 4. Log webhook
    await this.prisma.processedWebhook.create({
      data: {
        provider: 'paystack',
        providerTxId: reference,
        eventType: event,
        rawPayload: payload,
        signatureValid: true,
      },
    });

    // 5. Process based on event type
    if (event === 'charge.success') {
      return this.handlePaystackChargeSuccess(data);
    }

    if (event === 'transfer.success') {
      return this.handlePaystackTransferSuccess(data, req);
    }

    if (event === 'transfer.failed') {
      return this.handlePaystackTransferFailed(data);
    }

    if (event === 'transfer.reversed') {
      return this.handlePaystackTransferReversed(data);
    }

    return { status: 'ignored', reason: 'unknown_event_type' };
  }

  private async handlePaystackChargeSuccess(data: any) {
    const reference = data.reference;
    const amountKobo = data.amount;
    const amount = new Decimal(amountKobo).div(100);
    const auth = data.authorization || {};

    // 1) Funding flow: transaction created when user initiated Paystack payment (card/bank)
    const transaction = await this.prisma.transaction.findUnique({
      where: { reference },
    });

    if (transaction) {
      if (transaction.status === 'SUCCESS') {
        return { status: 'already_processed' };
      }
      const userId = transaction.senderId ?? transaction.receiverId;
      if (!userId) {
        this.logger.error('Paystack charge: No userId on transaction', {
          reference,
        });
        return { status: 'no_user' };
      }
      await this.prisma.$transaction(async (tx) => {
        const balance = await tx.balance.findUnique({
          where: { userId_currency: { userId, currency: 'NGN' } },
        });
        const before = new Decimal(balance?.amount?.toString() ?? '0');
        const after = before.add(amount);
        await tx.balance.upsert({
          where: { userId_currency: { userId, currency: 'NGN' } },
          create: {
            userId,
            currency: 'NGN',
            amount: after.toNumber(),
            lastUpdatedBy: 'paystack_charge',
          },
          update: {
            amount: after.toNumber(),
            lastUpdatedBy: 'paystack_charge',
          },
        });
        await tx.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'SUCCESS',
            beforeBalance: before.toNumber(),
            afterBalance: after.toNumber(),
          },
        });
      });
      await this.prisma.auditLog.create({
        data: {
          action: 'PAYSTACK_CHARGE_SUCCESS',
          userId,
          actorType: 'system',
          metadata: { reference, amount: amount.toString() },
        },
      });
      this.logger.log(
        `Paystack charge: Credited ₦${amount.toString()} to ${userId}`,
        { reference },
      );
      return { status: 'success' };
    }

    // 2) DVA (Dedicated Virtual Account) deposit: bank transfer to user's virtual account
    if (
      auth.channel === 'dedicated_nuban' &&
      auth.receiver_bank_account_number
    ) {
      const accountNumber = String(auth.receiver_bank_account_number).trim();
      const user = await this.prisma.user.findFirst({
        where: { reservedAccountNumber: accountNumber },
      });
      if (!user) {
        this.logger.warn('Paystack DVA charge: No user for account', {
          accountNumber,
          reference,
        });
        return { status: 'user_not_found' };
      }
      const userId = user.id;
      await this.prisma.$transaction(async (tx) => {
        const balance = await tx.balance.findUnique({
          where: { userId_currency: { userId, currency: 'NGN' } },
        });
        const before = new Decimal(balance?.amount?.toString() ?? '0');
        const after = before.add(amount);
        await tx.balance.upsert({
          where: { userId_currency: { userId, currency: 'NGN' } },
          create: {
            userId,
            currency: 'NGN',
            amount: after.toNumber(),
            lastUpdatedBy: 'paystack_dva',
          },
          update: {
            amount: after.toNumber(),
            lastUpdatedBy: 'paystack_dva',
          },
        });
        await tx.transaction.create({
          data: {
            senderId: null,
            receiverId: userId,
            amount: amount.toNumber(),
            currency: 'NGN',
            type: 'deposit',
            status: 'SUCCESS',
            reference: `DVA-${reference}`,
            idempotencyKey: `DVA-${reference}`,
            beforeBalance: before.toNumber(),
            afterBalance: after.toNumber(),
            metadata: {
              provider: 'paystack',
              channel: 'dedicated_nuban',
              paystackReference: reference,
            },
          },
        });
      });
      await this.prisma.auditLog.create({
        data: {
          action: 'PAYSTACK_DVA_CHARGE_SUCCESS',
          userId,
          actorType: 'system',
          metadata: { reference, amount: amount.toString(), accountNumber },
        },
      });
      this.logger.log(
        `Paystack DVA: Credited ₦${amount.toString()} to ${userId}`,
        { reference, accountNumber },
      );
      return { status: 'success' };
    }

    this.logger.warn('Paystack charge: Transaction not found and not DVA', {
      reference,
    });
    return { status: 'transaction_not_found' };
  }

  private async handlePaystackTransferSuccess(data: any, req: Request) {
    const reference = data.reference;
    const amount = new Decimal(data.amount);

    // Find the transaction
    const transaction = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: reference },
    });

    if (!transaction) {
      this.logger.warn('Paystack: Transaction not found', { reference });
      return { status: 'transaction_not_found' };
    }

    if (transaction.status === 'SUCCESS') {
      return { status: 'already_processed' };
    }

    // Update transaction status
    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'SUCCESS' },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'PAYSTACK_TRANSFER_SUCCESS',
        userId: transaction.senderId || undefined,
        actorType: 'system',
        metadata: {
          reference,
          amount: amount.toString(),
        } as any,
        ipAddress: req.ip || undefined,
      },
    });

    this.logger.log(`Paystack: Transfer successful`, { reference });

    return { status: 'success' };
  }

  private async handlePaystackTransferFailed(data: any) {
    const reference = data.reference;
    const reason = data.reason;

    // Find the transaction
    const transaction = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: reference },
    });

    if (transaction) {
      // Refund the amount back to user
      await this.prisma.$transaction(async (tx) => {
        const balance = await tx.balance.findUnique({
          where: {
            userId_currency: {
              userId: transaction.senderId!,
              currency: 'NGN',
            },
          },
        });

        const beforeBalance = balance
          ? new Decimal(balance.amount.toString())
          : new Decimal(0);
        const transAmount = new Decimal(transaction.amount);
        const afterBalance = beforeBalance.add(transAmount);

        await tx.balance.update({
          where: {
            userId_currency: {
              userId: transaction.senderId!,
              currency: 'NGN',
            },
          },
          data: {
            amount: afterBalance.toNumber(),
            lastUpdatedBy: 'paystack_refund',
          },
        });

        await tx.transaction.update({
          where: { id: transaction.id },
          data: { status: 'FAILED' },
        });
      });

      this.logger.warn(`Paystack: Transfer failed and refunded`, {
        reference,
        reason,
      });
    }

    return { status: 'failed', reason };
  }

  private async handlePaystackTransferReversed(data: any) {
    const reference = data.reference;
    const amount = data.amount;

    // Find and refund transaction
    const transaction = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: reference },
    });

    if (transaction && transaction.status === 'SUCCESS') {
      await this.prisma.$transaction(async (tx) => {
        const balance = await tx.balance.findUnique({
          where: {
            userId_currency: {
              userId: transaction.senderId!,
              currency: 'NGN',
            },
          },
        });

        const beforeBalance = balance
          ? new Decimal(balance.amount.toString())
          : new Decimal(0);
        const refundAmount = new Decimal(amount);
        const afterBalance = beforeBalance.add(refundAmount);

        await tx.balance.update({
          where: {
            userId_currency: {
              userId: transaction.senderId!,
              currency: 'NGN',
            },
          },
          data: {
            amount: afterBalance.toNumber(),
            lastUpdatedBy: 'paystack_reversal',
          },
        });

        await tx.transaction.update({
          where: { id: transaction.id },
          data: { status: 'REVERSED' },
        });

        await tx.auditLog.create({
          data: {
            action: 'PAYSTACK_TRANSFER_REVERSED',
            userId: transaction.senderId!,
            actorType: 'system',
            metadata: {
              reference,
              amount: refundAmount.toString(),
            } as any,
          },
        });
      });

      this.logger.log(`Paystack: Transfer reversed and refunded`, {
        reference,
      });
    }

    return { status: 'reversed' };
  }

  // ============================================
  // PREMBLY SDK WEBHOOK (full identity: BVN + NIN + face)
  // ============================================

  /**
   * When user completes Prembly widget (BVN + NIN + face), Prembly POSTs here.
   * We set user to Tier 2 + PENDING so they appear in admin for approval. Admin approves → Tier 3 VERIFIED.
   */
  @Post('prembly')
  @HttpCode(200)
  async handlePremblyWebhook(@Body() payload: any, @Req() req: Request) {
    const verification = payload?.verification ?? payload?.data?.verification;
    const status = verification?.status;
    const reference =
      verification?.reference ??
      payload?.data?.verification_response?.reference;

    const widgetInfo =
      payload?.data?.widget_info ?? payload?.data?.data?.widget_info ?? {};
    const userRef = widgetInfo.user_ref;

    if (!userRef) {
      this.logger.warn('Prembly webhook missing user_ref in widget_info', {
        ip: req.ip,
      });
      return { status: 'ignored', reason: 'missing_user_ref' };
    }

    const providerTxId = reference ?? `prembly-${userRef}-${Date.now()}`;

    const existing = await this.prisma.processedWebhook.findUnique({
      where: { providerTxId },
    });
    if (existing) {
      return { status: 'already_processed' };
    }

    if (status !== 'VERIFIED' && status !== 'verified') {
      this.logger.log('Prembly webhook status not VERIFIED', {
        status,
        userRef,
      });
      return { status: 'ignored', reason: 'not_verified' };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userRef },
      select: { id: true, kycTier: true },
    });
    if (!user) {
      this.logger.warn('Prembly webhook user not found', { userRef });
      return { status: 'ignored', reason: 'user_not_found' };
    }

    const firstName =
      widgetInfo.first_name ?? payload?.data?.verified_first_name;
    const lastName = widgetInfo.last_name ?? payload?.data?.verified_last_name;

    await this.prisma.processedWebhook.create({
      data: {
        provider: 'prembly',
        providerTxId,
        eventType: 'verification.completed',
        rawPayload: payload,
        signatureValid: true,
      },
    });

    await this.prisma.user.update({
      where: { id: userRef },
      data: {
        kycTier: 2,
        kycStatus: 'PENDING',
        kycRejectionReason: null,
        bvnVerified: true,
        bvnVerifiedAt: new Date(),
        ninVerified: true,
        ninVerifiedAt: new Date(),
        biometricVerified: true,
        ...(firstName && { legalFirstName: String(firstName).trim() }),
        ...(lastName && { legalLastName: String(lastName).trim() }),
      },
    });

    // If Prembly sent document/selfie images, save to User so admin can review in dashboard
    await this.savePremblyDocsToUser(userRef, payload);

    this.logger.log(
      'Prembly verification completed: user set to Tier 2 PENDING (awaiting admin)',
      { userId: userRef },
    );

    return { status: 'ok', tier: 2 };
  }

  // ============================================
  // KORAPAY VIRTUAL BANK ACCOUNT WEBHOOK (charge.success)
  // ============================================

  @Post('korapay')
  @HttpCode(200)
  async handleKorapayWebhook(@Body() payload: any, @Req() req: Request) {
    const event = payload?.event;
    const data = payload?.data;
    if (event !== 'charge.success' || !data) {
      return { status: 'ignored', reason: 'event_not_handled' };
    }
    const reference = data.reference;
    const amountRaw = data.amount;
    const vba = data.virtual_bank_account_details?.virtual_bank_account;
    const accountReference = vba?.account_reference; // we set this to user.id
    if (!reference || amountRaw == null || !accountReference) {
      this.logger.warn('Korapay webhook missing reference/amount/account_reference', {
        ip: req.ip,
      });
      return { status: 'ignored', reason: 'missing_data' };
    }
    const amount = new Decimal(amountRaw);
    if (amount.lte(0)) return { status: 'ignored', reason: 'invalid_amount' };

    const existing = await this.prisma.processedWebhook.findUnique({
      where: { providerTxId: reference },
    });
    if (existing) return { status: 'already_processed' };

    await this.prisma.processedWebhook.create({
      data: {
        provider: 'korapay',
        providerTxId: reference,
        eventType: 'charge.success',
        rawPayload: payload,
        signatureValid: true,
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: accountReference },
      select: { id: true },
    });
    if (!user) {
      this.logger.warn('Korapay webhook user not found', { accountReference });
      return { status: 'user_not_found' };
    }

    const existingTx = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: reference },
    });
    if (existingTx) return { status: 'already_processed' };

    try {
      await this.limitsService.checkMaxBalance(user.id, amount, 'NGN');
    } catch {
      this.logger.warn(
        'Korapay deposit would exceed max balance limit; crediting anyway and flagging',
        { userId: user.id, reference, amount: amount.toString() },
      );
      await this.prisma.auditLog.create({
        data: {
          action: 'BALANCE_LIMIT_EXCEEDED_CREDIT',
          userId: user.id,
          actorType: 'system',
          metadata: {
            reference,
            amount: amount.toString(),
            provider: 'korapay',
          } as any,
        },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const balance = await tx.balance.findUnique({
        where: {
          userId_currency: { userId: user.id, currency: 'NGN' },
        },
      });
      const beforeBalance = balance
        ? new Decimal(balance.amount.toString())
        : new Decimal(0);
      const afterBalance = beforeBalance.add(amount);
      await tx.balance.upsert({
        where: {
          userId_currency: { userId: user.id, currency: 'NGN' },
        },
        create: {
          userId: user.id,
          currency: 'NGN',
          amount: afterBalance.toNumber(),
          lastUpdatedBy: 'korapay_vba',
        },
        update: {
          amount: afterBalance.toNumber(),
          lastUpdatedBy: 'korapay_vba',
        },
      });
      await tx.transaction.create({
        data: {
          receiverId: user.id,
          amount: amount.toNumber(),
          currency: 'NGN',
          type: 'deposit',
          status: 'SUCCESS',
          idempotencyKey: reference,
          providerTxId: reference,
          beforeBalance: beforeBalance.toNumber(),
          afterBalance: afterBalance.toNumber(),
          reference: `KPY-${reference}`,
          metadata: {
            provider: 'korapay',
            vbaAccountNumber: vba?.account_number,
            vbaBankName: vba?.bank_name,
          } as any,
        },
      });
    });

    this.logger.log('Korapay VBA deposit credited', {
      userId: user.id,
      reference,
      amount: amount.toString(),
    });
    return { status: 'ok' };
  }

  /**
   * Extract document and selfie from Prembly webhook (biometric_results) and upload to Cloudinary,
   * then set User.idCardUrl and User.selfieUrl so admin dashboard can display them.
   */
  private async savePremblyDocsToUser(
    userId: string,
    payload: any,
  ): Promise<void> {
    if (!this.cloudinary.isConfigured) return;
    const data = payload?.data ?? payload?.verification_response;
    const biometric =
      data?.biometric_results ??
      data?.verification_response?.data?.biometric_results;
    if (!biometric) return;

    const imagesFromId = Array.isArray(biometric.images_from_id)
      ? biometric.images_from_id
      : [];
    const imagesFromFrontend = Array.isArray(biometric.images_from_frontend)
      ? biometric.images_from_frontend
      : [];
    const idB64 = imagesFromId[0];
    const selfieB64 = imagesFromFrontend[0];
    if (!idB64 && !selfieB64) return;

    const updateData: {
      idCardUrl?: string;
      selfieUrl?: string;
      idType?: string;
    } = {};
    const prefix = userId.replace(/\W/g, '_');

    try {
      if (idB64) {
        const buf = this.decodeBase64Image(idB64);
        if (buf) {
          const { url } = await this.cloudinary.uploadImage(
            buf,
            `prembly-id-${prefix}-${Date.now()}.jpg`,
            'kyc/prembly-id',
            'image/jpeg',
          );
          updateData.idCardUrl = url;
          updateData.idType = 'nin';
        }
      }
      if (selfieB64) {
        const buf = this.decodeBase64Image(selfieB64);
        if (buf) {
          const { url } = await this.cloudinary.uploadImage(
            buf,
            `prembly-selfie-${prefix}-${Date.now()}.jpg`,
            'kyc/prembly-selfie',
            'image/jpeg',
          );
          updateData.selfieUrl = url;
        }
      }
      if (updateData.idCardUrl || updateData.selfieUrl) {
        await this.prisma.user.update({
          where: { id: userId },
          data: updateData,
        });
        this.logger.log('Prembly docs saved to user for admin review', {
          userId,
          hasId: !!updateData.idCardUrl,
          hasSelfie: !!updateData.selfieUrl,
        });
      }
    } catch (err) {
      this.logger.warn('Failed to save Prembly docs to user (non-fatal)', {
        userId,
        message: (err as Error).message,
      });
    }
  }

  private decodeBase64Image(value: string): Buffer | null {
    if (typeof value !== 'string') return null;
    let b64 = value.trim();
    const dataUrlMatch = /^data:image\/\w+;base64,(.+)$/.exec(b64);
    if (dataUrlMatch) b64 = dataUrlMatch[1];
    try {
      return Buffer.from(b64, 'base64');
    } catch {
      return null;
    }
  }

  // ============================================
  // SIGNATURE VERIFICATION HELPERS
  // ============================================

  /**
   * Verify Monnify webhook signature
   */
  private verifyMonnifySignature(payload: string, signature: string): boolean {
    if (!this.monnifySecret) {
      this.logger.error('MONNIFY_WEBHOOK_SECRET not configured!');
      return false;
    }

    const expected = crypto
      .createHmac('sha512', this.monnifySecret)
      .update(payload, 'utf8')
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  }

  /**
   * Verify Paystack webhook signature
   */
  private verifyPaystackSignature(payload: string, signature: string): boolean {
    if (!this.paystackSecret) {
      this.logger.error(
        'PAYSTACK_SECRET_KEY (or PAYSTACK_WEBHOOK_SECRET) not configured!',
      );
      return false;
    }

    const expected = crypto
      .createHmac('sha512', this.paystackSecret)
      .update(payload, 'utf8')
      .digest('hex');

    return signature === expected;
  }
}
