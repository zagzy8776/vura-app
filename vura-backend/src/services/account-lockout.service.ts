import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AccountLockoutService {
  private readonly MAX_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes

  constructor(private prisma: PrismaService) {}

  async recordFailedAttempt(userId: string): Promise<void> {
    const now = new Date();

    // Get user with current failed attempts
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { failedPinAttempts: true, lockedUntil: true },
    });

    if (!user) {
      return;
    }

    // Check if already locked
    if (user.lockedUntil && user.lockedUntil > now) {
      return; // Already locked
    }

    const newAttemptCount = user.failedPinAttempts + 1;

    // Lock account if threshold reached
    if (newAttemptCount >= this.MAX_ATTEMPTS) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          lockedUntil: new Date(now.getTime() + this.LOCKOUT_DURATION),
          failedPinAttempts: newAttemptCount,
        },
      });
    } else {
      // Increment failed attempts
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          failedPinAttempts: newAttemptCount,
        },
      });
    }
  }

  async isAccountLocked(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { lockedUntil: true },
    });

    if (!user || !user.lockedUntil) {
      return false;
    }

    const now = new Date();
    if (user.lockedUntil <= now) {
      // Lockout expired, remove it
      await this.prisma.user.update({
        where: { id: userId },
        data: { lockedUntil: null },
      });
      return false;
    }

    return true;
  }

  async clearFailedAttempts(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedPinAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  async getLockoutInfo(userId: string): Promise<{
    isLocked: boolean;
    lockedUntil?: Date;
    failedAttempts: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { lockedUntil: true, failedPinAttempts: true },
    });

    if (!user) {
      return { isLocked: false, failedAttempts: 0 };
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil <= now) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lockedUntil: null },
      });
      return { isLocked: false, failedAttempts: 0 };
    }

    return {
      isLocked: !!(user.lockedUntil && user.lockedUntil > now),
      lockedUntil: user.lockedUntil || undefined,
      failedAttempts: user.failedPinAttempts,
    };
  }
}
