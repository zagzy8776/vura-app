import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface TransactionVelocityCheck {
  allowed: boolean;
  reason?: string;
  currentVelocity: number;
  threshold: number;
  timeWindowMinutes: number;
}

export interface BeneficiaryHoldCheck {
  requiresHold: boolean;
  holdHours?: number;
  reason?: string;
  holdUntil?: Date;
}

export interface HighValueTransactionCheck {
  flagged: boolean;
  reason?: string;
  requiresReview: boolean;
}

export interface RiskAssessment {
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  flags: string[];
  requiresManualReview: boolean;
  recommendedAction: 'approve' | 'review' | 'hold' | 'block';
}

@Injectable()
export class EWSService {
  private readonly logger = new Logger(EWSService.name);

  private readonly velocityThresholdAmount = parseFloat(
    process.env.EWS_VELOCITY_THRESHOLD_AMOUNT || '500000',
  );
  private readonly velocityThresholdTime = parseFloat(
    process.env.EWS_VELOCITY_THRESHOLD_TIME_MINUTES || '60',
  );
  private readonly highValueThreshold = parseFloat(
    process.env.EWS_HIGH_VALUE_THRESHOLD || '5000000',
  );
  private readonly firstTimeBeneficiaryHoldHours = parseFloat(
    process.env.EWS_FIRST_TIME_BENEFICIARY_HOLD_HOURS || '24',
  );

  constructor(private prisma: PrismaService) {}

  /**
   * Check transaction velocity (amount/time)
   */
  async checkTransactionVelocity(
    userId: string,
    amount: number,
  ): Promise<TransactionVelocityCheck> {
    try {
      const timeWindowStart = new Date(
        Date.now() - this.velocityThresholdTime * 60 * 1000,
      );

      const recentTransactions = await this.prisma.transaction.findMany({
        where: {
          senderId: userId,
          createdAt: { gte: timeWindowStart },
          status: { in: ['COMPLETED', 'PENDING'] },
        },
        select: { amount: true },
      });

      const totalAmount = recentTransactions.reduce((sum, tx) => {
        const txAmount =
          typeof tx.amount === 'string'
            ? parseFloat(tx.amount)
            : Number(tx.amount);
        return sum + txAmount;
      }, 0);

      const newTotal = totalAmount + amount;
      const exceeded = newTotal > this.velocityThresholdAmount;

      this.logger.log(
        `Velocity check for user ${userId}: ₦${newTotal} in ${this.velocityThresholdTime}min (threshold: ₦${this.velocityThresholdAmount})`,
      );

      return {
        allowed: !exceeded,
        reason: exceeded
          ? `Exceeded velocity limit of ₦${this.velocityThresholdAmount} in ${this.velocityThresholdTime} minutes`
          : undefined,
        currentVelocity: newTotal,
        threshold: this.velocityThresholdAmount,
        timeWindowMinutes: this.velocityThresholdTime,
      };
    } catch (error) {
      this.logger.error(`Error checking velocity: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Check if beneficiary is first-time and requires hold
   */
  async checkBeneficiaryHold(
    userId: string,
    beneficiaryId: string,
  ): Promise<BeneficiaryHoldCheck> {
    try {
      const previousTransactions = await this.prisma.transaction.findMany({
        where: {
          senderId: userId,
          receiverId: beneficiaryId,
          status: 'COMPLETED',
        },
        take: 1,
      });

      const isFirstTime = previousTransactions.length === 0;

      if (isFirstTime) {
        const holdUntil = new Date(
          Date.now() + this.firstTimeBeneficiaryHoldHours * 60 * 60 * 1000,
        );

        this.logger.log(
          `First-time beneficiary hold for user ${userId}: ${this.firstTimeBeneficiaryHoldHours}h hold`,
        );

        return {
          requiresHold: true,
          holdHours: this.firstTimeBeneficiaryHoldHours,
          reason: `First-time beneficiary. Funds will be available in ${this.firstTimeBeneficiaryHoldHours} hours.`,
          holdUntil,
        };
      }

      return {
        requiresHold: false,
      };
    } catch (error) {
      this.logger.error(
        `Error checking beneficiary hold: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Flag high-value transactions for review
   */
  checkHighValueTransaction(amount: number): HighValueTransactionCheck {
    const flagged = amount > this.highValueThreshold;

    if (flagged) {
      this.logger.log(
        `High-value transaction flagged: ₦${amount} (threshold: ₦${this.highValueThreshold})`,
      );
    }

    return {
      flagged,
      reason: flagged
        ? `Amount ₦${amount} exceeds high-value threshold of ₦${this.highValueThreshold}`
        : undefined,
      requiresReview: flagged,
    };
  }

  /**
   * Comprehensive risk assessment
   */
  async assessTransactionRisk(
    userId: string,
    amount: number,
    beneficiaryId: string,
  ): Promise<RiskAssessment> {
    try {
      const flags: string[] = [];
      let riskScore = 10;

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { fraudScore: true, kycTier: true, ninVerified: true },
      });

      if (user?.fraudScore && user.fraudScore > 50) {
        flags.push(`High fraud score (${user.fraudScore}/100)`);
        riskScore += 30;
      }

      if (user?.kycTier === 1) {
        flags.push('KYC Tier 1 (Basic verification only)');
        riskScore += 15;
      }

      if (!user?.ninVerified) {
        flags.push('NIN not verified');
        riskScore += 10;
      }

      const velocityCheck = await this.checkTransactionVelocity(userId, amount);
      if (!velocityCheck.allowed) {
        flags.push(`Velocity check failed: ${velocityCheck.reason}`);
        riskScore += 25;
      }

      const holdCheck = await this.checkBeneficiaryHold(userId, beneficiaryId);
      if (holdCheck.requiresHold) {
        flags.push(`First-time beneficiary (${holdCheck.holdHours}h hold)`);
        riskScore += 20;
      }

      const highValueCheck = this.checkHighValueTransaction(amount);
      if (highValueCheck.flagged) {
        flags.push(`High-value transaction: ₦${amount}`);
        riskScore += 20;
      }

      const hour = new Date().getHours();
      if (hour >= 22 || hour < 6) {
        flags.push('Transaction during unusual hours');
        riskScore += 10;
      }

      const last5Minutes = new Date(Date.now() - 5 * 60 * 1000);
      const recentCount = await this.prisma.transaction.count({
        where: {
          senderId: userId,
          createdAt: { gte: last5Minutes },
        },
      });

      if (recentCount > 3) {
        flags.push(`${recentCount} transactions in last 5 minutes`);
        riskScore += 15;
      }

      let riskLevel: 'low' | 'medium' | 'high';
      let recommendedAction: 'approve' | 'review' | 'hold' | 'block';

      if (riskScore < 30) {
        riskLevel = 'low';
        recommendedAction = 'approve';
      } else if (riskScore < 60) {
        riskLevel = 'medium';
        recommendedAction = 'review';
      } else {
        riskLevel = 'high';
        recommendedAction = riskScore >= 80 ? 'block' : 'hold';
      }

      const assessment: RiskAssessment = {
        riskScore: Math.min(100, riskScore),
        riskLevel,
        flags,
        requiresManualReview: riskScore >= 50,
        recommendedAction,
      };

      this.logger.log(
        `Risk assessment for user ${userId}: ${riskLevel} (${assessment.riskScore}/100) - ${recommendedAction}`,
      );

      return assessment;
    } catch (error) {
      this.logger.error(`Error assessing risk: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Create transaction hold (stored in metadata)
   */
  async createTransactionHold(
    transactionId: string,
    reason: string,
    holdHours: number,
  ): Promise<void> {
    try {
      const holdUntil = new Date(Date.now() + holdHours * 60 * 60 * 1000);

      await this.prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'HELD',
          metadata: {
            holdReason: reason,
            holdUntil: holdUntil.toISOString(),
            heldAt: new Date().toISOString(),
          },
        },
      });

      this.logger.log(
        `Transaction hold created for ${transactionId}: ${reason} (${holdHours}h)`,
      );
    } catch (error) {
      this.logger.error(`Error creating hold: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Release transaction hold
   */
  async releaseTransactionHold(
    transactionId: string,
    notes?: string,
  ): Promise<void> {
    try {
      await this.prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'COMPLETED',
          metadata: {
            holdReleasedAt: new Date().toISOString(),
            releaseNotes: notes,
          },
        },
      });

      this.logger.log(`Transaction hold released: ${transactionId}`);
    } catch (error) {
      this.logger.error(`Error releasing hold: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Get held transactions for user
   */
  async getHeldTransactions(userId: string): Promise<any[]> {
    try {
      const held = await this.prisma.transaction.findMany({
        where: {
          senderId: userId,
          status: 'HELD',
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return held;
    } catch (error) {
      this.logger.error(
        `Error fetching held transactions: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
