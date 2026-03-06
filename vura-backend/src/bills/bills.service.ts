import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PeyflexService } from '../services/peyflex.service';
import Decimal from 'decimal.js';
import { v4 as uuid } from 'uuid';

const ELECTRICITY_FEE = 100;

@Injectable()
export class BillsService {
  private readonly logger = new Logger(BillsService.name);

  constructor(
    private prisma: PrismaService,
    private peyflex: PeyflexService,
  ) {}

  // ── Airtime ───────────────────────────────────────────────────────────

  async getAirtimeNetworks() {
    const networks = await this.peyflex.getAirtimeNetworks();
    if (networks.length > 0) return networks;
    return [
      { id: 'mtn', name: 'MTN' },
      { id: 'glo', name: 'GLO' },
      { id: 'airtel', name: 'Airtel' },
      { id: '9mobile', name: '9mobile' },
    ];
  }

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
            provider: 'peyflex',
          },
        },
      });

      return { transaction, afterBalance };
    });

    const result = await this.peyflex.buyAirtime({
      network: data.network,
      phoneNumber: data.phoneNumber,
      amount: data.amount,
    });

    if (!result.success) {
      await this.refundTransaction(userId, tx.transaction.id, amount, reference);
      throw new BadRequestException(result.message || 'Airtime purchase failed. You have been refunded.');
    }

    await this.prisma.transaction.update({
      where: { id: tx.transaction.id },
      data: {
        status: 'SUCCESS',
        metadata: {
          billType: 'airtime',
          network: data.network,
          phoneNumber: data.phoneNumber,
          provider: 'peyflex',
          providerResponse: result.data,
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'AIRTIME_PURCHASE',
        userId,
        actorType: 'user',
        metadata: { reference, network: data.network, phoneNumber: data.phoneNumber, amount: data.amount, provider: 'peyflex' },
      },
    });

    this.logger.log(`Airtime: ₦${data.amount} → ${data.phoneNumber} (${data.network}) by ${userId} via Peyflex`);

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

  async getDataNetworks() {
    const networks = await this.peyflex.getDataNetworks();
    if (networks.length > 0) return networks;
    return [
      { id: 'mtn', name: 'MTN' },
      { id: 'glo', name: 'GLO' },
      { id: 'airtel', name: 'Airtel' },
      { id: '9mobile', name: '9mobile' },
    ];
  }

  async getDataPlans(network: string) {
    const plans = await this.peyflex.getDataPlans(network);
    return plans.map((item: any) => ({
      plan_code: item.plan_code ?? item.id ?? item.name,
      name: item.name ?? item.plan_name ?? item.description,
      price: item.price ?? item.amount ?? 0,
    }));
  }

  async buyData(
    userId: string,
    data: { phoneNumber: string; planCode: string; network: string },
  ) {
    if (!data.phoneNumber || !/^0[789]\d{9}$/.test(data.phoneNumber)) {
      throw new BadRequestException('Enter a valid Nigerian phone number');
    }

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
            provider: 'peyflex',
          },
        },
      });

      return { transaction, afterBalance };
    });

    const result = await this.peyflex.buyData({
      network: data.network,
      phoneNumber: data.phoneNumber,
      planCode: data.planCode,
    });

    if (!result.success) {
      await this.refundTransaction(userId, tx.transaction.id, planPrice, reference);
      throw new BadRequestException(result.message || 'Data purchase failed. You have been refunded.');
    }

    await this.prisma.transaction.update({
      where: { id: tx.transaction.id },
      data: {
        status: 'SUCCESS',
        metadata: {
          billType: 'data',
          network: data.network,
          phoneNumber: data.phoneNumber,
          planCode: data.planCode,
          planName: plan.name,
          planPrice: planPrice.toString(),
          provider: 'peyflex',
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
          provider: 'peyflex',
        },
      },
    });

    this.logger.log(`Data: ${data.planCode} (₦${planPrice}) → ${data.phoneNumber} (${data.network}) by ${userId} via Peyflex`);

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

  // ── Electricity ────────────────────────────────────────────────────────

  async getElectricityDiscos() {
    const plans = await this.peyflex.getElectricityPlans();
    if (plans.length > 0) return plans;
    return [
      { id: 'eko-electric', name: 'Eko Electric (EKEDC)' },
      { id: 'ikeja-electric', name: 'Ikeja Electric (IKEDC)' },
      { id: 'ibadan-electric', name: 'Ibadan Electric (IBEDC)' },
      { id: 'enugu-electric', name: 'Enugu Electric (EEDC)' },
      { id: 'portharcourt-electric', name: 'Port Harcourt Electric (PHED)' },
      { id: 'benin-electric', name: 'Benin Electric (BEDC)' },
      { id: 'kaduna-electric', name: 'Kaduna Electric (KEDC)' },
      { id: 'kano-electric', name: 'Kano Electric (KEDCO)' },
      { id: 'abuja-electric', name: 'Abuja Electric (AEDC)' },
    ];
  }

  async getElectricityItems(disco: string) {
    return [
      { item_code: `${disco}-prepaid`, biller_code: disco, name: 'Prepaid', amount: 0, fee: ELECTRICITY_FEE },
      { item_code: `${disco}-postpaid`, biller_code: disco, name: 'Postpaid', amount: 0, fee: ELECTRICITY_FEE },
    ];
  }

  async validateMeter(input: {
    meterNumber: string;
    itemCode: string;
    billerCode: string;
  }) {
    const type = input.itemCode.includes('prepaid') ? 'prepaid' : 'postpaid';
    const result = await this.peyflex.verifyMeter({
      meterNumber: input.meterNumber,
      plan: input.billerCode,
      type,
    });

    if (!result.success) {
      return { success: false, message: result.message || 'Meter validation failed' };
    }

    // Do not expose customer name/address before payment (privacy). Only confirm meter is valid.
    return {
      success: true,
      data: {
        valid: true,
        meterNumber: input.meterNumber,
      },
    };
  }

  async buyElectricity(
    userId: string,
    data: {
      meterNumber: string;
      amount: number;
      disco: string;
      type: string;
      itemName: string;
      itemCode: string;
      fee?: number;
      phoneNumber?: string;
    },
  ) {
    if (data.amount < 500) {
      throw new BadRequestException('Minimum electricity purchase is ₦500');
    }
    if (data.amount > 500000) {
      throw new BadRequestException('Maximum electricity purchase is ₦500,000');
    }

    if (!data.meterNumber || data.meterNumber.length < 6) {
      throw new BadRequestException('Enter a valid meter number');
    }

    const amount = new Decimal(data.amount);
    const fee = new Decimal(data.fee ?? ELECTRICITY_FEE);
    const totalDebit = amount.add(fee);
    const reference = `ELEC-${uuid()}`;

    const tx = await this.prisma.$transaction(async (prisma) => {
      const balance = await prisma.balance.findUnique({
        where: { userId_currency: { userId, currency: 'NGN' } },
      });

      const currentBalance = new Decimal(balance?.amount?.toString() ?? '0');
      if (currentBalance.lessThan(totalDebit)) {
        throw new BadRequestException(
          `Insufficient balance. You need ₦${totalDebit.toFixed(0)} (₦${data.amount} + ₦${fee.toFixed(0)} fee)`,
        );
      }

      const afterBalance = currentBalance.sub(totalDebit);

      await prisma.balance.update({
        where: { userId_currency: { userId, currency: 'NGN' } },
        data: { amount: afterBalance.toNumber(), lastUpdatedBy: 'bills_service' },
      });

      const transaction = await prisma.transaction.create({
        data: {
          senderId: userId,
          amount: totalDebit.toNumber(),
          currency: 'NGN',
          type: 'bill_payment',
          status: 'PENDING',
          idempotencyKey: reference,
          reference,
          beforeBalance: currentBalance.toNumber(),
          afterBalance: afterBalance.toNumber(),
          metadata: {
            billType: 'electricity',
            disco: data.disco,
            meterType: data.type,
            meterNumber: data.meterNumber,
            amount: data.amount,
            fee: fee.toNumber(),
            provider: 'peyflex',
          },
        },
      });

      return { transaction, afterBalance };
    });

    const result = await this.peyflex.buyElectricity({
      meterNumber: data.meterNumber,
      plan: data.disco,
      amount: data.amount,
      type: data.type,
      phoneNumber: data.phoneNumber || '08000000000',
    });

    if (!result.success) {
      await this.refundTransaction(userId, tx.transaction.id, totalDebit, reference);
      throw new BadRequestException(
        result.message || 'Electricity purchase failed. You have been refunded.',
      );
    }

    const token: string | null = result.data?.token ?? result.data?.Token ?? null;

    await this.prisma.transaction.update({
      where: { id: tx.transaction.id },
      data: {
        status: 'SUCCESS',
        metadata: {
          billType: 'electricity',
          disco: data.disco,
          meterType: data.type,
          meterNumber: data.meterNumber,
          amount: data.amount,
          fee: fee.toNumber(),
          token,
          provider: 'peyflex',
          providerResponse: result.data,
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'ELECTRICITY_PURCHASE',
        userId,
        actorType: 'user',
        metadata: {
          reference,
          disco: data.disco,
          meterType: data.type,
          meterNumber: data.meterNumber,
          amount: data.amount,
          fee: fee.toNumber(),
          provider: 'peyflex',
        },
      },
    });

    this.logger.log(`Electricity: ₦${data.amount} → ${data.meterNumber} (${data.disco} ${data.type}) by ${userId} via Peyflex`);

    return {
      success: true,
      data: {
        reference,
        disco: data.disco,
        meterType: data.type,
        meterNumber: data.meterNumber,
        amount: data.amount,
        fee: fee.toNumber(),
        token,
        balanceAfter: tx.afterBalance.toFixed(2),
      },
      message: token
        ? `Electricity token: ${token}`
        : `₦${data.amount} electricity payment processed`,
    };
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
