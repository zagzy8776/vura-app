import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Logger,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { EWSService } from '../services/ews.service';
import { PrismaService } from '../prisma.service';

@Controller('api/ews')
@UseGuards(AuthGuard)
export class EWSController {
  private readonly logger = new Logger(EWSController.name);

  constructor(
    private ewsService: EWSService,
    private prisma: PrismaService,
  ) {}

  /**
   * Get risk assessment for a transaction
   */
  @Get('assess/:transactionId')
  async assessTransaction(@Param('transactionId') transactionId: string) {
    try {
      const transaction = await this.prisma.transaction.findUnique({
        where: { id: transactionId },
        select: {
          senderId: true,
          receiverId: true,
          amount: true,
          type: true,
        },
      });

      if (!transaction) {
        throw new BadRequestException('Transaction not found');
      }

      const assessment = await this.ewsService.assessTransactionRisk(
        transaction.senderId!,
        Number(transaction.amount),
        transaction.receiverId!,
      );

      return {
        success: true,
        data: assessment,
      };
    } catch (error) {
      this.logger.error(
        `Error assessing transaction: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Get held transactions for a user
   */
  @Get('holds/user/:userId')
  async getUserHolds(@Param('userId') userId: string) {
    try {
      const holds = await this.ewsService.getHeldTransactions(userId);

      return {
        success: true,
        data: holds,
        count: holds.length,
      };
    } catch (error) {
      this.logger.error(
        `Error fetching user holds: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Get all held transactions (admin endpoint)
   */
  @Get('holds')
  async getAllHolds(
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('status') status?: string,
  ) {
    try {
      const skip = (page - 1) * limit;

      const where = status ? { status } : { status: 'HELD' };

      const [holds, total] = await Promise.all([
        this.prisma.transaction.findMany({
          where,
          include: {
            sender: {
              select: {
                id: true,
                vuraTag: true,
                emailEncrypted: true,
                kycTier: true,
              },
            },
            receiver: {
              select: {
                id: true,
                vuraTag: true,
                emailEncrypted: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.transaction.count({ where }),
      ]);

      return {
        success: true,
        data: holds,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching holds: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Release a transaction hold
   */
  @Post('holds/:transactionId/release')
  async releaseHold(
    @Param('transactionId') transactionId: string,
    @Body() body: { approvedBy: string; notes?: string },
  ) {
    try {
      const { approvedBy, notes } = body;

      if (!approvedBy) {
        throw new BadRequestException('approvedBy is required');
      }

      // Verify transaction exists and is held
      const transaction = await this.prisma.transaction.findUnique({
        where: { id: transactionId },
        select: { status: true, senderId: true, amount: true },
      });

      if (!transaction) {
        throw new BadRequestException('Transaction not found');
      }

      if (transaction.status !== 'HELD') {
        throw new BadRequestException('Transaction is not on hold');
      }

      // Release the hold
      await this.ewsService.releaseTransactionHold(transactionId, notes);

      // Log the release
      await this.prisma.auditLog.create({
        data: {
          action: 'TRANSACTION_HOLD_RELEASED',
          userId: transaction.senderId!,
          actorType: 'admin',
          actorId: approvedBy,
          metadata: {
            transactionId,
            amount: transaction.amount.toString(),
            notes,
            releasedAt: new Date().toISOString(),
          },
        },
      });

      return {
        success: true,
        message: 'Transaction hold released successfully',
      };
    } catch (error) {
      this.logger.error(`Error releasing hold: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Create a manual hold (admin action)
   */
  @Post('holds/:transactionId/create')
  async createHold(
    @Param('transactionId') transactionId: string,
    @Body() body: { reason: string; holdHours: number; createdBy: string },
  ) {
    try {
      const { reason, holdHours, createdBy } = body;

      if (!reason || !holdHours || !createdBy) {
        throw new BadRequestException(
          'reason, holdHours, and createdBy are required',
        );
      }

      // Verify transaction exists
      const transaction = await this.prisma.transaction.findUnique({
        where: { id: transactionId },
        select: { status: true, senderId: true, amount: true },
      });

      if (!transaction) {
        throw new BadRequestException('Transaction not found');
      }

      if (transaction.status === 'HELD') {
        throw new BadRequestException('Transaction is already on hold');
      }

      // Create the hold
      await this.ewsService.createTransactionHold(
        transactionId,
        reason,
        holdHours,
      );

      // Log the hold creation
      await this.prisma.auditLog.create({
        data: {
          action: 'TRANSACTION_HOLD_CREATED',
          userId: transaction.senderId!,
          actorType: 'admin',
          actorId: createdBy,
          metadata: {
            transactionId,
            amount: transaction.amount.toString(),
            reason,
            holdHours,
            createdAt: new Date().toISOString(),
          },
        },
      });

      return {
        success: true,
        message: 'Transaction hold created successfully',
      };
    } catch (error) {
      this.logger.error(`Error creating hold: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Get velocity check for user
   */
  @Get('velocity/:userId')
  async checkVelocity(
    @Param('userId') userId: string,
    @Query('amount') amount: number,
  ) {
    try {
      if (!amount || amount <= 0) {
        throw new BadRequestException('Valid amount is required');
      }

      const velocity = await this.ewsService.checkTransactionVelocity(
        userId,
        amount,
      );

      return {
        success: true,
        data: velocity,
      };
    } catch (error) {
      this.logger.error(`Error checking velocity: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Get beneficiary hold check
   */
  @Get('beneficiary-hold/:userId/:beneficiaryId')
  async checkBeneficiaryHold(
    @Param('userId') userId: string,
    @Param('beneficiaryId') beneficiaryId: string,
  ) {
    try {
      const hold = await this.ewsService.checkBeneficiaryHold(
        userId,
        beneficiaryId,
      );

      return {
        success: true,
        data: hold,
      };
    } catch (error) {
      this.logger.error(
        `Error checking beneficiary hold: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Get high-value transaction check
   */
  @Get('high-value/:amount')
  async checkHighValue(@Param('amount') amount: number) {
    try {
      if (!amount || amount <= 0) {
        throw new BadRequestException('Valid amount is required');
      }

      const check = this.ewsService.checkHighValueTransaction(amount);

      return {
        success: true,
        data: check,
      };
    } catch (error) {
      this.logger.error(
        `Error checking high value: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Get EWS statistics (admin dashboard)
   */
  @Get('stats')
  async getStats() {
    try {
      const [
        totalHeld,
        totalReleased,
        velocityViolations,
        highValueFlags,
        avgRiskScore,
      ] = await Promise.all([
        this.prisma.transaction.count({ where: { status: 'HELD' } }),
        this.prisma.transaction.count({
          where: {
            status: 'COMPLETED',
            metadata: {
              path: ['holdReleasedAt'],
              not: Prisma.JsonNull,
            },
          },
        }),

        this.prisma.transaction.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
            metadata: {
              path: ['velocityViolation'],
              equals: true,
            },
          },
        }),
        this.prisma.transaction.count({
          where: {
            amount: { gte: this.ewsService['highValueThreshold'] },
          },
        }),
        this.prisma.transaction.aggregate({
          _avg: { amount: true },
          where: {
            status: 'HELD',
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        }),
      ]);

      return {
        success: true,
        data: {
          totalHeld,
          totalReleased,
          velocityViolations,
          highValueFlags,
          avgRiskScore: avgRiskScore._avg?.amount || 0,
          thresholds: {
            velocityAmount: this.ewsService['velocityThresholdAmount'],
            velocityTime: this.ewsService['velocityThresholdTime'],
            highValue: this.ewsService['highValueThreshold'],
            beneficiaryHold: this.ewsService['firstTimeBeneficiaryHoldHours'],
          },
        },
      };
    } catch (error) {
      this.logger.error(
        `Error fetching EWS stats: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
