import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { randomBytes } from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class QrCodesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Generate a QR payment code for merchant
   * Customer scans → enters amount → security countdown → instant payment
   */
  async generateQrCode(
    merchantId: string,
    amount?: number,
    description?: string,
    expiresInMinutes: number = 30,
  ) {
    // Verify merchant exists and is active
    const merchant = await this.prisma.user.findUnique({
      where: { id: merchantId },
      select: { id: true, vuraTag: true, kycTier: true },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    if (merchant.kycTier < 1) {
      throw new BadRequestException(
        'Merchant must complete KYC to accept payments',
      );
    }

    // Generate unique QR code
    const code = this.generateUniqueCode();
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // Create QR code record
    const qrCode = await this.prisma.qrPaymentCode.create({
      data: {
        merchantId,
        code,
        amount: amount ? new Decimal(amount) : null,
        description: description || 'Payment',
        expiresAt,
        status: 'active',
        metadata: {
          merchantVuraTag: merchant.vuraTag,
          generatedAt: new Date().toISOString(),
        },
      },
    });

    // Return QR code data for frontend to generate QR image
    return {
      success: true,
      qrCode: {
        id: qrCode.id,
        code: qrCode.code,
        amount: amount || null,
        description: qrCode.description,
        merchantVuraTag: merchant.vuraTag,
        expiresAt: qrCode.expiresAt,
      },
      // QR code content (what gets encoded in the QR)
      qrContent: JSON.stringify({
        type: 'vura_payment',
        code: qrCode.code,
        merchant: merchant.vuraTag,
        amount: amount || null,
        expires: expiresAt.toISOString(),
      }),
    };
  }

  /**
   * Validate and process QR code payment
   * Called when customer scans QR code
   */
  async validateQrCode(code: string) {
    const qrCode = await this.prisma.qrPaymentCode.findUnique({
      where: { code },
      include: {
        merchant: {
          select: {
            vuraTag: true,
            kycTier: true,
          },
        },
      },
    });

    if (!qrCode) {
      throw new NotFoundException('Invalid QR code');
    }

    if (qrCode.status !== 'active') {
      throw new BadRequestException(`QR code is ${qrCode.status}`);
    }

    if (new Date() > qrCode.expiresAt) {
      // Auto-expire the code
      await this.prisma.qrPaymentCode.update({
        where: { id: qrCode.id },
        data: { status: 'expired' },
      });
      throw new BadRequestException('QR code has expired');
    }

    return {
      valid: true,
      qrCode: {
        id: qrCode.id,
        merchantVuraTag: qrCode.merchant.vuraTag,
        merchantKycTier: qrCode.merchant.kycTier,
        amount: qrCode.amount ? Number(qrCode.amount) : null,
        description: qrCode.description,
        expiresAt: qrCode.expiresAt,
      },
    };
  }

  /**
   * Process QR code payment
   * Called after security countdown confirmation
   */
  async processQrPayment(
    payerId: string,
    code: string,
    amount: number,
    pin: string,
  ) {
    // Validate QR code again
    const qrCode = await this.prisma.qrPaymentCode.findUnique({
      where: { code },
      include: {
        merchant: {
          select: {
            id: true,
            vuraTag: true,
          },
        },
      },
    });

    if (!qrCode || qrCode.status !== 'active') {
      throw new BadRequestException('Invalid or expired QR code');
    }

    // If QR has fixed amount, use it; otherwise use provided amount
    const finalAmount = qrCode.amount ? Number(qrCode.amount) : amount;

    if (!finalAmount || finalAmount <= 0) {
      throw new BadRequestException('Invalid payment amount');
    }

    // Check if QR code has fixed amount and customer provided different amount
    if (qrCode.amount && Number(qrCode.amount) !== amount) {
      throw new BadRequestException(
        `This QR code requires exactly ₦${Number(qrCode.amount)}`,
      );
    }

    // Mark QR code as used
    await this.prisma.qrPaymentCode.update({
      where: { id: qrCode.id },
      data: {
        status: 'used',
        usedAt: new Date(),
        usedBy: payerId,
      },
    });

    // Return payment details for transaction processing
    return {
      success: true,
      recipientVuraTag: qrCode.merchant.vuraTag,
      recipientId: qrCode.merchant.id,
      amount: finalAmount,
      description: qrCode.description || 'QR Payment',
      qrCodeId: qrCode.id,
    };
  }

  /**
   * Get merchant's QR code history
   */
  async getMerchantQrCodes(merchantId: string, status?: string) {
    const where: any = { merchantId };
    if (status) {
      where.status = status;
    }

    const qrCodes = await this.prisma.qrPaymentCode.findMany({
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

    return qrCodes.map((qr) => ({
      id: qr.id,
      code: qr.code,
      amount: qr.amount ? Number(qr.amount) : null,
      description: qr.description,
      status: qr.status,
      createdAt: qr.createdAt,
      expiresAt: qr.expiresAt,
      usedAt: qr.usedAt,
      usedBy: qr.payer?.vuraTag || null,
    }));
  }

  /**
   * Revoke/expire a QR code
   */
  async revokeQrCode(merchantId: string, qrCodeId: string) {
    const qrCode = await this.prisma.qrPaymentCode.findFirst({
      where: {
        id: qrCodeId,
        merchantId,
      },
    });

    if (!qrCode) {
      throw new NotFoundException('QR code not found');
    }

    if (qrCode.status !== 'active') {
      throw new BadRequestException('QR code is already used or expired');
    }

    await this.prisma.qrPaymentCode.update({
      where: { id: qrCodeId },
      data: { status: 'expired' },
    });

    return { success: true, message: 'QR code revoked' };
  }

  /**
   * Generate unique QR code string
   */
  private generateUniqueCode(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(8).toString('hex');
    return `VURA-${timestamp}-${random}`.toUpperCase();
  }
}
