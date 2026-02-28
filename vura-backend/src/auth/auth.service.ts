import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { encrypt, normalizePhone, validatePhone } from '../utils/encryption';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { EmailService } from '../services/email.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}


  async register(dto: RegisterDto) {
    const { phone, email, pin, vuraTag } = dto;


    // Validate phone format
    if (!validatePhone(phone)) {
      throw new BadRequestException(
        'Invalid phone number format. Use +234XXXXXXXXXX or 0XXXXXXXXXX',
      );
    }

    // Normalize phone to +234 format
    const normalizedPhone = normalizePhone(phone);

    // Check if vura tag already exists
    const existingTag = await this.prisma.user.findUnique({
      where: { vuraTag },
    });
    if (existingTag) {
      throw new BadRequestException('Vura tag already taken');
    }

    // Check if phone already exists
    const allUsers = await this.prisma.user.findMany({
      select: { id: true, phoneEncrypted: true },
    });

    for (const existingUser of allUsers) {
      try {
        const decryptedPhone = existingUser.phoneEncrypted;
        if (decryptedPhone === normalizedPhone) {
          throw new BadRequestException('Phone number already registered');
        }
      } catch {
        continue;
      }
    }

    // Hash PIN
    const hashedPin = await bcrypt.hash(pin, 10);

    // Encrypt phone with AES-256-GCM
    const phoneEncrypted = encrypt(normalizedPhone);

    // Encrypt email if provided
    const emailEncrypted = email ? encrypt(email) : null;

    const user = await this.prisma.user.create({
      data: {
        vuraTag,
        phoneEncrypted,
        emailEncrypted,
        hashedPin,
        kycTier: 1,
      },
    });



    // Create default balances
    await this.prisma.balance.createMany({
      data: [
        { userId: user.id, currency: 'NGN', amount: 0 },
        { userId: user.id, currency: 'USDT', amount: 0 },
      ],
    });

    // Generate JWT
    const token = this.generateToken(user.id, user.vuraTag);

    return {
      user: {
        id: user.id,
        vuraTag: user.vuraTag,
        kycTier: user.kycTier,
      },
      token,
    };
  }

  async login(dto: LoginDto) {
    const { vuraTag, pin, deviceFingerprint } = dto;

    const user = await this.prisma.user.findUnique({
      where: { vuraTag },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new UnauthorizedException(
        `Account locked. Try again in ${minutesLeft} minutes`,
      );
    }

    // Verify PIN
    const pinValid = await bcrypt.compare(pin, user.hashedPin || '');

    if (!pinValid) {
      const failedAttempts = (user.failedPinAttempts || 0) + 1;
      let lockedUntil = null;
      if (failedAttempts >= 3) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedPinAttempts: failedAttempts,
          lockedUntil,
        },
      });

      throw new UnauthorizedException('Invalid PIN');
    }

    // Check for new device
    const isNewDevice = this.validateDeviceFingerprint(
      user.lastDeviceFingerprint,
      deviceFingerprint || null,
    );

    if (isNewDevice === 'new_device') {
      // Generate and send OTP
      const otp = this.generateOtp();
      const otpHash = await bcrypt.hash(otp, 10);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store OTP in database
      await this.prisma.oTP.create({
        data: {
          userId: user.id,
          otpHash,
          purpose: 'device_verification',
          expiresAt,
        },
      });

      // Send OTP email
      const deviceInfo = this.parseDeviceFingerprint(deviceFingerprint);
      await this.emailService.sendDeviceVerificationOtp(
        user.id,
        otp,
        deviceInfo,
      );

      // Return pending verification response
      return {
        requiresVerification: true,
        method: 'email_otp',
        message: 'Please check your email for verification code',
      };
    }

    // Reset failed attempts and update login info
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedPinAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastDeviceFingerprint: deviceFingerprint,
      },
    });

    // Generate JWT
    const token = this.generateToken(user.id, user.vuraTag);

    return {
      user: {
        id: user.id,
        vuraTag: user.vuraTag,
        kycTier: user.kycTier,
      },
      token,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        balances: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      vuraTag: user.vuraTag,
      kycTier: user.kycTier,
      bvnVerified: user.bvnVerified,
      biometricVerified: user.biometricVerified,
      balances: user.balances.map((b) => ({
        currency: b.currency,
        amount: Number(b.amount),
      })),
      createdAt: user.createdAt,
    };
  }

  /**
   * Find user by vuraTag
   */
  async findByVuraTag(vuraTag: string) {
    return this.prisma.user.findUnique({
      where: { vuraTag },
    });
  }

  /**
   * Reset user PIN
   */
  async resetPin(userId: string, newPin: string): Promise<void> {
    const hashedPin = await bcrypt.hash(newPin, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        hashedPin,
        failedPinAttempts: 0,
        lockedUntil: null,
      },
    });


    // Log PIN change
    await this.prisma.auditLog.create({
      data: {
        action: 'PIN_RESET',
        userId,
        actorType: 'user',
        metadata: {
          resetAt: new Date().toISOString(),
        },
      },
    });
  }

  /**
   * Revoke all user sessions
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        userId,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });
  }

  private generateToken(userId: string, vuraTag: string): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error(
        'JWT_SECRET environment variable must be at least 32 characters',
      );
    }
    const expiresIn = (process.env.JWT_EXPIRES_IN ||
      '24h') as jwt.SignOptions['expiresIn'];
    return jwt.sign({ userId, vuraTag }, secret, { expiresIn });
  }

  /**
   * Validate device fingerprint and return warning if different
   */
  private validateDeviceFingerprint(
    lastFingerprint: string | null,
    currentFingerprint: string | null,
  ): string | null {
    if (!lastFingerprint || !currentFingerprint) {
      return null;
    }

    if (lastFingerprint !== currentFingerprint) {
      return 'new_device';
    }

    return null;
  }

  /**
   * Generate 6-digit OTP
   */
  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Parse device fingerprint into readable info
   */
  private parseDeviceFingerprint(fingerprint: string | undefined): {
    browser: string;
    os: string;
    ip?: string;
  } {
    if (!fingerprint) {
      return { browser: 'Unknown', os: 'Unknown' };
    }

    try {
      const parts = fingerprint.split('|');
      return {
        browser: parts[0] || 'Unknown',
        os: parts[1] || 'Unknown',
        ip: parts[2],
      };
    } catch {
      return { browser: 'Unknown', os: 'Unknown' };
    }
  }

  /**
   * Verify device OTP and complete login
   */
  async verifyDeviceOtp(
    vuraTag: string,
    otp: string,
    deviceFingerprint: string,
  ): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { vuraTag },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Find valid OTP
    const otpRecord = await this.prisma.oTP.findFirst({
      where: {
        userId: user.id,
        purpose: 'device_verification',
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new UnauthorizedException('OTP expired or invalid');
    }

    // Verify OTP
    const otpValid = await bcrypt.compare(otp, otpRecord.otpHash);
    if (!otpValid) {
      // Increment attempts
      await this.prisma.oTP.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid OTP');
    }

    // Mark OTP as used
    await this.prisma.oTP.update({
      where: { id: otpRecord.id },
      data: { used: true },
    });

    // Update user device and login info
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedPinAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastDeviceFingerprint: deviceFingerprint,
      },
    });

    // Generate JWT
    const token = this.generateToken(user.id, user.vuraTag);

    return {
      user: {
        id: user.id,
        vuraTag: user.vuraTag,
        kycTier: user.kycTier,
      },
      token,
    };
  }
}
