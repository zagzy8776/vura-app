import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import {
  encrypt,
  decrypt,
  normalizePhone,
  validatePhone,
} from '../utils/encryption';
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

    const bypassOtpEmail = process.env.BYPASS_OTP_EMAIL === 'true';
    const disableOtpVerification = process.env.DISABLE_OTP_VERIFICATION === 'true';

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

    // Check if this is production environment
    const isProduction = process.env.NODE_ENV === 'production';

    // Temporary: allow immediate registration/login without OTP
    // (useful when email provider/domain is not configured yet)
    if (disableOtpVerification) {
      const user = await this.prisma.user.create({
        data: {
          vuraTag,
          phoneEncrypted,
          emailEncrypted,
          hashedPin,
          kycTier: 1,
        },
      });

      await this.prisma.balance.createMany({
        data: [
          { userId: user.id, currency: 'NGN', amount: 0 },
          { userId: user.id, currency: 'USDT', amount: 0 },
        ],
      });

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

    if (isProduction) {
      // In production, require OTP verification before creating account
      // Generate OTP and store it temporarily
      const otp = this.generateOtp();
      const otpHash = await bcrypt.hash(otp, 10);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store pending registration with OTP
      const pendingRegistration = await this.prisma.pendingRegistration.create({
        data: {
          vuraTag,
          phoneEncrypted,
          emailEncrypted,
          hashedPin,
          otpHash,
          expiresAt,
        },
      });

      // Send OTP email (if configured). If BYPASS_OTP_EMAIL=true, expose OTP in response.
      let otpDelivered = false;
      if (email && this.emailService.isEmailEnabled()) {
        otpDelivered = await this.emailService.sendRegistrationOtp(
          pendingRegistration.id,
          otp,
          { browser: 'Unknown', os: 'Unknown' },
        );
      }

      const response: Record<string, any> = {
        requiresVerification: true,
        method: 'email_otp',
        message:
          'Please check your email for verification code to complete registration',
        pendingId: pendingRegistration.id,
      };

      if (bypassOtpEmail && !otpDelivered) {
        response.otp = otp;
        response.message =
          'Email bypass enabled: use the OTP from this response to complete registration';
      }

      return response;
    } else {
      // In development, create account directly
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
  }

  /**
   * Complete registration with OTP verification
   */
  async completeRegistration(pendingId: string, otp: string) {
    const pendingRegistration =
      await this.prisma.pendingRegistration.findUnique({
        where: { id: pendingId },
      });

    if (!pendingRegistration) {
      throw new BadRequestException('Invalid registration request');
    }

    if (pendingRegistration.expiresAt < new Date()) {
      throw new BadRequestException('Registration link has expired');
    }

    if (pendingRegistration.otpAttempts >= 3) {
      throw new BadRequestException(
        'Too many OTP attempts. Please start registration again',
      );
    }

    // Verify OTP
    const otpValid = await bcrypt.compare(otp, pendingRegistration.otpHash);
    if (!otpValid) {
      await this.prisma.pendingRegistration.update({
        where: { id: pendingId },
        data: { otpAttempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid OTP');
    }

    // Create user account
    const user = await this.prisma.user.create({
      data: {
        vuraTag: pendingRegistration.vuraTag,
        phoneEncrypted: pendingRegistration.phoneEncrypted,
        emailEncrypted: pendingRegistration.emailEncrypted,
        hashedPin: pendingRegistration.hashedPin,
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

    // Clean up pending registration
    await this.prisma.pendingRegistration.delete({
      where: { id: pendingId },
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

    const bypassOtpEmail = process.env.BYPASS_OTP_EMAIL === 'true';
    const disableOtpVerification = process.env.DISABLE_OTP_VERIFICATION === 'true';

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

    // If OTP verification disabled, skip new-device OTP entirely
    if (disableOtpVerification) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedPinAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
          lastDeviceFingerprint: deviceFingerprint,
        },
      });

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

      // Send OTP email (if configured). If BYPASS_OTP_EMAIL=true, expose OTP in response.
      let otpDelivered = false;
      if (this.emailService.isEmailEnabled()) {
        const deviceInfo = this.parseDeviceFingerprint(deviceFingerprint);
        otpDelivered = await this.emailService.sendDeviceVerificationOtp(
          user.id,
          otp,
          deviceInfo,
        );
      }

      // Return pending verification response
      const response: Record<string, any> = {
        requiresVerification: true,
        method: 'email_otp',
        message: 'Please check your email for verification code',
      };

      if (bypassOtpEmail && !otpDelivered) {
        response.otp = otp;
        response.message =
          'Email bypass enabled: use the OTP from this response to complete login';
      }

      return response;
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
   * Find user by email
   */
  async findByEmail(email: string) {
    const allUsers = await this.prisma.user.findMany({
      select: { id: true, emailEncrypted: true, vuraTag: true },
    });

    for (const user of allUsers) {
      try {
        const decryptedEmail = user.emailEncrypted;
        if (decryptedEmail === email) {
          return {
            id: user.id,
            vuraTag: user.vuraTag,
            emailEncrypted: user.emailEncrypted,
          };
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Send OTP email
   */
  async sendOTPEmail(
    userId: string,
    emailEncrypted: string,
    otp: string,
    purpose: string,
  ) {
    // Decrypt the email
    const email = decrypt(emailEncrypted);

    if (!email) {
      throw new BadRequestException('No email provided for OTP');
    }

    // Parse device info from context or use defaults
    const deviceInfo = {
      browser: 'Unknown',
      os: 'Unknown',
      ip: 'Unknown',
    };

    // Send OTP email based on purpose
    if (purpose === 'registration') {
      await this.emailService.sendRegistrationOtp(userId, otp, deviceInfo);
    } else if (purpose === 'device_verification') {
      await this.emailService.sendDeviceVerificationOtp(
        userId,
        otp,
        deviceInfo,
      );
    } else {
      throw new BadRequestException('Invalid OTP purpose');
    }
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
      // Handle different fingerprint formats
      const parts = fingerprint.split('|');

      // Extract browser info with better parsing
      let browser = 'Unknown';
      if (parts[0]) {
        const browserRaw = parts[0].toLowerCase();
        if (browserRaw.includes('chrome')) browser = 'Chrome';
        else if (browserRaw.includes('firefox')) browser = 'Firefox';
        else if (browserRaw.includes('safari')) browser = 'Safari';
        else if (browserRaw.includes('edge')) browser = 'Edge';
        else if (browserRaw.includes('opera')) browser = 'Opera';
        else browser = parts[0];
      }

      // Extract OS info with better parsing
      let os = 'Unknown';
      if (parts[1]) {
        const osRaw = parts[1].toLowerCase();
        if (osRaw.includes('windows')) os = 'Windows';
        else if (osRaw.includes('macos') || osRaw.includes('mac os'))
          os = 'macOS';
        else if (osRaw.includes('linux')) os = 'Linux';
        else if (osRaw.includes('android')) os = 'Android';
        else if (osRaw.includes('ios')) os = 'iOS';
        else os = parts[1];
      }

      return {
        browser,
        os,
        ip: parts[2] || undefined,
      };
    } catch (error) {
      // Log parsing error for debugging
      console.warn('Failed to parse device fingerprint:', fingerprint, error);
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
