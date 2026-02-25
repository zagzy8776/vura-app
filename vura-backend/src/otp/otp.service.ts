import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class OTPService {
  constructor(private prisma: PrismaService) {}

  private readonly OTP_EXPIRY_MINUTES = 5;
  private readonly MAX_ATTEMPTS = 3;

  /**
   * Generate 6-digit OTP
   */
  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Hash OTP for storage
   */
  private hashOTP(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  /**
   * Create and store OTP
   */
  async createOTP(userId: string, purpose: 'pin_reset' | 'phone_verify'): Promise<string> {
    // Invalidate any existing OTPs for this purpose
    await this.prisma.oTP.deleteMany({
      where: {
        userId,
        purpose,
      },
    });

    const otp = this.generateOTP();
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    await this.prisma.oTP.create({
      data: {
        userId,
        otpHash: this.hashOTP(otp),
        purpose,
        expiresAt,
        attempts: 0,
      },
    });

    // TODO: Send OTP via SMS
    // For now, return it (in production, this would be sent to user's phone)
    return otp;
  }

  /**
   * Verify OTP
   */
  async verifyOTP(userId: string, otp: string, purpose: 'pin_reset' | 'phone_verify'): Promise<boolean> {
    const otpRecord = await this.prisma.oTP.findFirst({
      where: {
        userId,
        purpose,
        expiresAt: { gt: new Date() },
        used: false,
      },
    });

    if (!otpRecord) {
      throw new BadRequestException('OTP expired or not found');
    }

    if (otpRecord.attempts >= this.MAX_ATTEMPTS) {
      // Invalidate OTP after max attempts
      await this.prisma.oTP.update({
        where: { id: otpRecord.id },
        data: { used: true },
      });
      throw new BadRequestException('Too many failed attempts. Please request a new OTP.');
    }

    // Increment attempts
    await this.prisma.oTP.update({
      where: { id: otpRecord.id },
      data: { attempts: { increment: 1 } },
    });

    const isValid = this.hashOTP(otp) === otpRecord.otpHash;

    if (isValid) {
      // Mark as used
      await this.prisma.oTP.update({
        where: { id: otpRecord.id },
        data: { used: true },
      });
    }

    return isValid;
  }

  /**
   * Clean up expired OTPs
   */
  async cleanupExpiredOTPs(): Promise<number> {
    const result = await this.prisma.oTP.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { used: true },
        ],
      },
    });

    return result.count;
  }
}
