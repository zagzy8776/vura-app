import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { FlutterwaveService } from '../services/flutterwave.service';
import Decimal from 'decimal.js';
import { v4 as uuid } from 'uuid';

const AIRTIME_NETWORKS = [
  { id: 'mtn', name: 'MTN' },
  { id: 'glo', name: 'GLO' },
  { id: 'airtel', name: 'Airtel' },
  { id: '9mobile', name: '9mobile' },
];

const DATA_NETWORKS = [
  { id: 'BIL108', name: 'MTN' },
  { id: 'BIL109', name: 'GLO' },
  { id: 'BIL110', name: 'Airtel' },
  { id: 'BIL111', name: '9mobile' },
];

@Injectable()
export class BillsService {
  private readonly logger = new Logger(BillsService.name);

  constructor(
    private prisma: PrismaService,
    private flutterwave: FlutterwaveService,
  ) {}

  // ── Airtime ───────────────────────────────────────────────────────────

  async buyAirtime(
    userId: string,
    data: { phoneNumber: string; amount: number; network: string },
  ) {
    if (data.amount < 50 || data.amount > 50000) {
      throw new BadRequestException('Airtime amount must be between ₦50 and ₦50,000');
    }

    if (!data.phoneNumber || !/^0[789]\d{9}$/.test(data.phoneNumber)) {
      throw new BadRequestException('Enter a valid Nigerian phone number');
    }

    const amount = new Decimal(data.amount);
    const reference = `AIRTIME-${uuid()}`;

    const tx = await this.prisma.$transaction(async (prisma) => {
      const balance = await prisma.balance.findUnique({
        where: { userId_currency: { userId, currency: 'NGN' } },
      });

      const currentBalance = new Decimal(balance?.amount?.toString() ?? '0');
      if (currentBalance.lessThan(amount)) {
        throw new BadRequestException('Insufficient balance');
      }

      const afterBalance = currentBalance.sub(amount);

      await prisma.balance.update({
        where: { userId_currency: { userId, currency: 'NGN' } },
        data: { amount: afterBalance.toNumber(), lastUpdatedBy: 'bills_service' },
      });

      const transaction = await prisma.transaction.create({
        data: {
          senderId: userId,
          amount: amount.toNumber(),
          currency: 'NGN',
          type: 'bill_payment',
          status: 'PENDING',
          idempotencyKey: reference,
          reference,
          beforeBalance: currentBalance.toNumber(),
          afterBalance: afterBalance.toNumber(),
          metadata: {
            billType: 'airtime',
            network: data.network,
            phoneNumber: data.phoneNumber,
          },
        },
      });

      return { transaction, afterBalance };
    });

    // Flutterwave auto-detects network from phone number
    const result = await this.flutterwave.createBillPayment({
      country: 'NG',
      customer: data.phoneNumber,
      amount: data.amount,
      type: 'AIRTIME',
      reference,
    });

    if (!result.success) {
      await this.refundTransaction(userId, tx.transaction.id, amount, reference);
      throw new BadRequestException(result.message || 'Airtime purchase failed. You have been refunded.');
    }

    await this.prisma.transaction.update({
      where: { id: tx.transaction.id },
      data: {
        status: 'SUCCESS',
        providerTxId: result.data?.tx_ref ?? result.data?.reference ?? null,
        metadata: {
          billType: 'airtime',
          network: data.network,
          phoneNumber: data.phoneNumber,
          providerResponse: result.data,
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'AIRTIME_PURCHASE',
        userId,
        actorType: 'user',
        metadata: {
          reference,
          network: data.network,
          phoneNumber: data.phoneNumber,
          amount: data.amount,
        },
      },
    });

    this.logger.log(`Airtime: ₦${data.amount} → ${data.phoneNumber} (${data.network}) by ${userId}`);

    return {
      success: true,
      data: {
        reference,
        network: data.network,
        phoneNumber: data.phoneNumber,
        amount: data.amount,
        balanceAfter: tx.afterBalance.toFixed(2),
      },
      message: `₦${data.amount} airtime sent to ${data.phoneNumber}`,
    };
  }

  // ── Data ──────────────────────────────────────────────────────────────

  async buyData(
    userId: string,
    data: { phoneNumber: string; planCode: string; network: string },
  ) {
    if (!data.phoneNumber || !/^0[789]\d{9}$/.test(data.phoneNumber)) {
      throw new BadRequestException('Enter a valid Nigerian phone number');
    }

    // planCode is the Flutterwave item name (used as `type` in the bill request)
    const plans = await this.getDataPlans(data.network);
    const plan = plans.find((p: any) => p.plan_code === data.planCode);

    if (!plan) {
      throw new BadRequestException('Invalid data plan selected');
    }

    const planPrice = new Decimal(plan.price ?? 0);
    if (planPrice.isZero()) {
      throw new BadRequestException('Could not determine plan price');
    }

    const reference = `DATA-${uuid()}`;

    const tx = await this.prisma.$transaction(async (prisma) => {
      const balance = await prisma.balance.findUnique({
        where: { userId_currency: { userId, currency: 'NGN' } },
      });

      const currentBalance = new Decimal(balance?.amount?.toString() ?? '0');
      if (currentBalance.lessThan(planPrice)) {
        throw new BadRequestException('Insufficient balance');
      }

      const afterBalance = currentBalance.sub(planPrice);

      await prisma.balance.update({
        where: { userId_currency: { userId, currency: 'NGN' } },
        data: { amount: afterBalance.toNumber(), lastUpdatedBy: 'bills_service' },
      });

      const transaction = await prisma.transaction.create({
        data: {
          senderId: userId,
          amount: planPrice.toNumber(),
          currency: 'NGN',
          type: 'bill_payment',
          status: 'PENDING',
          idempotencyKey: reference,
          reference,
          beforeBalance: currentBalance.toNumber(),
          afterBalance: afterBalance.toNumber(),
          metadata: {
            billType: 'data',
            network: data.network,
            phoneNumber: data.phoneNumber,
            planCode: data.planCode,
            planName: plan.name,
            planPrice: planPrice.toString(),
          },
        },
      });

      return { transaction, afterBalance };
    });

    // Flutterwave: `type` = the plan name from bill-categories
    const result = await this.flutterwave.createBillPayment({
      country: 'NG',
      customer: data.phoneNumber,
      amount: planPrice.toNumber(),
      type: data.planCode,
      reference,
    });

    if (!result.success) {
      await this.refundTransaction(userId, tx.transaction.id, planPrice, reference);
      throw new BadRequestException(result.message || 'Data purchase failed. You have been refunded.');
    }

    await this.prisma.transaction.update({
      where: { id: tx.transaction.id },
      data: {
        status: 'SUCCESS',
        providerTxId: result.data?.tx_ref ?? result.data?.reference ?? null,
        metadata: {
          billType: 'data',
          network: data.network,
          phoneNumber: data.phoneNumber,
          planCode: data.planCode,
          planName: plan.name,
          planPrice: planPrice.toString(),
          providerResponse: result.data,
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'DATA_PURCHASE',
        userId,
        actorType: 'user',
        metadata: {
          reference,
          network: data.network,
          phoneNumber: data.phoneNumber,
          planCode: data.planCode,
          amount: planPrice.toString(),
        },
      },
    });

    this.logger.log(
      `Data: ${data.planCode} (₦${planPrice}) → ${data.phoneNumber} (${data.network}) by ${userId}`,
    );

    return {
      success: true,
      data: {
        reference,
        network: data.network,
        phoneNumber: data.phoneNumber,
        planCode: data.planCode,
        planName: plan.name,
        amount: planPrice.toNumber(),
        balanceAfter: tx.afterBalance.toFixed(2),
      },
      message: `Data plan activated for ${data.phoneNumber}`,
    };
  }

  // ── Network / Plan Listings ───────────────────────────────────────────

  getAirtimeNetworks() {
    return AIRTIME_NETWORKS;
  }

  getDataNetworks() {
    return DATA_NETWORKS;
  }

  async getDataPlans(billerCode: string) {
    const items = await this.flutterwave.getDataPlansByBiller(billerCode);

    return items.map((item: any) => ({
      plan_code: item.name,
      name: item.short_name ?? item.name,
      price: item.amount,
      item_code: item.item_code,
      biller_code: item.biller_code,
    }));
  }

  // ── Refund helper ─────────────────────────────────────────────────────

  private async refundTransaction(
    userId: string,
    transactionId: string,
    amount: Decimal,
    reference: string,
  ) {
    try {
      await this.prisma.$transaction(async (prisma) => {
        const balance = await prisma.balance.findUnique({
          where: { userId_currency: { userId, currency: 'NGN' } },
        });

        const current = new Decimal(balance?.amount?.toString() ?? '0');
        const refunded = current.add(amount);

        await prisma.balance.update({
          where: { userId_currency: { userId, currency: 'NGN' } },
          data: { amount: refunded.toNumber(), lastUpdatedBy: 'bills_refund' },
        });

        await prisma.transaction.update({
          where: { id: transactionId },
          data: { status: 'FAILED' },
        });
      });

      await this.prisma.auditLog.create({
        data: {
          action: 'BILL_PAYMENT_REFUNDED',
          userId,
          actorType: 'system',
          metadata: { transactionId, reference, amount: amount.toString() },
        },
      });

      this.logger.warn(`Refunded ₦${amount} for failed bill ${reference}`);
    } catch (err) {
      this.logger.error(`CRITICAL: Refund failed for ${reference}: ${(err as Error).message}`);
    }
  }
}
