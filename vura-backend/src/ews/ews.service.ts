import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import Decimal from 'decimal.js';

export interface EWSResult {
  score: number; // 0-100
  flags: string[];
  action: 'allow' | 'flag' | 'block';
}

@Injectable()
export class EWSService {
  private readonly logger = new Logger(EWSService.name);

  // Risk thresholds
  private readonly VELOCITY_LIMIT = 5; // Max 5 transactions per hour
  private readonly VELOCITY_SCORE = 25;
  
  private readonly AMOUNT_MULTIPLIER = 3; // Flag if >3x average
  private readonly AMOUNT_ANOMALY_SCORE = 20;
  
  private readonly NEW_DEVICE_SCORE = 30;
  private readonly LOCATION_CHANGE_SCORE = 25;
  
  private readonly FREEZE_THRESHOLD = 80; // Auto-freeze if score >= 80

  constructor(private prisma: PrismaService) {}

  /**
   * Analyze transaction for fraud indicators
   */
  async analyzeTransaction(
    userId: string,
    amount: Decimal,
    deviceFingerprint: string,
    ipAddress: string,
  ): Promise<EWSResult> {
    const flags: string[] = [];
    let score = 0;

    // 1. Velocity Check - Max 5 transactions per hour
    const velocityScore = await this.checkVelocity(userId);
    if (velocityScore.exceeded) {
      score += this.VELOCITY_SCORE;
      flags.push(`velocity_exceeded:${velocityScore.count}_in_1h`);
    }

    // 2. Amount Anomaly - >3x average transaction
    const amountScore = await this.checkAmountAnomaly(userId, amount);
    if (amountScore.isAnomaly) {
      score += this.AMOUNT_ANOMALY_SCORE;
      flags.push(`amount_anomaly:${amountScore.multiplier.toFixed(1)}x_average`);
    }

    // 3. Device Deviation - New device + large amount
    const deviceScore = await this.checkDeviceDeviation(userId, deviceFingerprint, amount);
    if (deviceScore.isNewDevice) {
      score += this.NEW_DEVICE_SCORE;
      flags.push('new_device');
      if (amount.greaterThan(50000)) {
        score += 15; // Additional risk for large amount on new device
        flags.push('new_device_large_amount');
      }
    }

    // 4. Location Check - IP country change
    const locationScore = await this.checkLocationChange(userId, ipAddress);
    if (locationScore.isNewLocation) {
      score += this.LOCATION_CHANGE_SCORE;
      flags.push('location_change');
    }

    // Determine action
    let action: 'allow' | 'flag' | 'block' = 'allow';
    if (score >= this.FREEZE_THRESHOLD) {
      action = 'block';
      // Auto-freeze account
      await this.freezeAccount(userId, score, flags);
    } else if (score >= 40) {
      action = 'flag';
    }

    // Log the EWS check
    this.logger.warn(
      `EWS Check - User: ${userId}, Score: ${score}, Action: ${action}, Flags: ${flags.join(', ')}`,
    );

    // Store EWS result in transaction (will be linked by caller)
    await this.storeEWSResult(userId, score, flags, action);

    return { score, flags, action };
  }

  /**
   * Check transaction velocity (max 5 per hour)
   */
  private async checkVelocity(userId: string): Promise<{ exceeded: boolean; count: number }> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const count = await this.prisma.transaction.count({
      where: {
        senderId: userId,
        createdAt: { gte: oneHourAgo },
        status: { in: ['SUCCESS', 'PENDING', 'HELD'] },
      },
    });

    return {
      exceeded: count >= this.VELOCITY_LIMIT,
      count,
    };
  }

  /**
   * Check if amount is >3x average
   */
  private async checkAmountAnomaly(
    userId: string,
    amount: Decimal,
  ): Promise<{ isAnomaly: boolean; multiplier: number }> {
    // Get average of last 10 successful transactions
    const transactions = await this.prisma.transaction.findMany({
      where: {
        senderId: userId,
        status: 'SUCCESS',
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (transactions.length < 3) {
      // Not enough history, flag large amounts
      if (amount.greaterThan(100000)) {
        return { isAnomaly: true, multiplier: 10 };
      }
      return { isAnomaly: false, multiplier: 0 };
    }

    const avgAmount = transactions.reduce(
      (sum, tx) => sum.plus(tx.amount),
      new Decimal(0),
    ).dividedBy(transactions.length);

    const multiplier = amount.dividedBy(avgAmount).toNumber();

    return {
      isAnomaly: multiplier > this.AMOUNT_MULTIPLIER,
      multiplier,
    };
  }

  /**
   * Check if device is new for this user
   */
  private async checkDeviceDeviation(
    userId: string,
    deviceFingerprint: string,
    amount: Decimal,
  ): Promise<{ isNewDevice: boolean }> {
    // Check if this device has been used before
    const existingSession = await this.prisma.session.findFirst({
      where: {
        userId,
        deviceFingerprint,
        isRevoked: false,
      },
    });

    return {
      isNewDevice: !existingSession,
    };
  }

  /**
   * Check for location/IP changes
   */
  private async checkLocationChange(
    userId: string,
    ipAddress: string,
  ): Promise<{ isNewLocation: boolean }> {
    // Get last known IP from sessions
    const lastSession = await this.prisma.session.findFirst({
      where: { userId },
      orderBy: { lastActiveAt: 'desc' },
    });

    if (!lastSession || !lastSession.ipAddress) {
      return { isNewLocation: false }; // First session
    }

    // Simple IP comparison (in production, use geolocation)
    const isNewLocation = lastSession.ipAddress !== ipAddress;

    return { isNewLocation };
  }

  /**
   * Freeze account due to high fraud score
   */
  private async freezeAccount(
    userId: string,
    score: number,
    flags: string[],
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        fraudScore: score,
        lockedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        action: 'ACCOUNT_FROZEN',
        userId,
        actorType: 'system',
        metadata: {
          ewsScore: score,
          flags,
          reason: 'Fraud score exceeded threshold',
        },
      },
    });

    this.logger.error(
      `ACCOUNT FROZEN - User: ${userId}, Score: ${score}, Flags: ${flags.join(', ')}`,
    );

    // TODO: Send admin alert (email, SMS, push notification)
  }

  /**
   * Store EWS result for audit
   */
  private async storeEWSResult(
    userId: string,
    score: number,
    flags: string[],
    action: string,
  ): Promise<void> {
    // Store in a way that can be linked to the transaction
    // This could be a separate EWS log table or added to transaction metadata
    await this.prisma.auditLog.create({
      data: {
        action: 'EWS_CHECK',
        userId,
        actorType: 'system',
        metadata: {
          score,
          flags,
          action,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }

  /**
   * Get user's current fraud score and status
   */
  async getUserRiskStatus(userId: string): Promise<{
    fraudScore: number;
    isFrozen: boolean;
    lastFlags: string[];
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return { fraudScore: 0, isFrozen: false, lastFlags: [] };
    }

    // Get last EWS check
    const lastEWS = await this.prisma.auditLog.findFirst({
      where: {
        userId,
        action: 'EWS_CHECK',
      },
      orderBy: { timestamp: 'desc' },
    });

    const isFrozen = !!(user.lockedUntil && user.lockedUntil > new Date());


    return {
      fraudScore: user.fraudScore,
      isFrozen,
      lastFlags: (lastEWS?.metadata as any)?.flags || [],
    };
  }

  /**
   * Manual account unfreeze (admin only)
   */
  async unfreezeAccount(userId: string, adminId: string, reason: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        fraudScore: 0,
        lockedUntil: null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'ACCOUNT_UNFROZEN',
        userId,
        actorType: 'admin',
        actorId: adminId,
        metadata: {
          reason,
          unfrozenAt: new Date().toISOString(),
        },
      },
    });

    this.logger.log(`ACCOUNT UNFROZEN - User: ${userId}, By: ${adminId}, Reason: ${reason}`);
  }
}
