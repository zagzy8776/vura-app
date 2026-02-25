import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class BeneficiariesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Add a new beneficiary
   */
  async addBeneficiary(
    userId: string,
    data: {
      name: string;
      vuraTag?: string;
      accountNumber?: string;
      bankCode?: string;
      bankName?: string;
      type: 'vura' | 'bank';
    },
  ) {
    // Validate based on type
    if (data.type === 'vura' && !data.vuraTag) {
      throw new BadRequestException('vuraTag is required for Vura beneficiaries');
    }

    if (data.type === 'bank' && (!data.accountNumber || !data.bankCode)) {
      throw new BadRequestException('accountNumber and bankCode are required for bank beneficiaries');
    }

    // Check if beneficiary already exists
    const existing = await this.prisma.beneficiary.findFirst({
      where: {
        userId,
        OR: [
          { vuraTag: data.vuraTag || '' },
          { accountNumber: data.accountNumber || '' },
        ],
      },
    });

    if (existing) {
      throw new BadRequestException('Beneficiary already exists');
    }

    const beneficiary = await this.prisma.beneficiary.create({
      data: {
        userId,
        name: data.name,
        vuraTag: data.vuraTag || null,
        accountNumber: data.accountNumber || null,
        bankCode: data.bankCode || null,
        bankName: data.bankName || null,
        type: data.type,
      },
    });

    return beneficiary;
  }

  /**
   * Get all beneficiaries for user
   */
  async getBeneficiaries(userId: string) {
    return this.prisma.beneficiary.findMany({
      where: { userId },
      orderBy: [
        { isFavorite: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * Update beneficiary
   */
  async updateBeneficiary(
    userId: string,
    beneficiaryId: string,
    data: {
      name?: string;
      isFavorite?: boolean;
    },
  ) {
    const beneficiary = await this.prisma.beneficiary.findFirst({
      where: { id: beneficiaryId, userId },
    });

    if (!beneficiary) {
      throw new BadRequestException('Beneficiary not found');
    }

    return this.prisma.beneficiary.update({
      where: { id: beneficiaryId },
      data,
    });
  }

  /**
   * Delete beneficiary
   */
  async deleteBeneficiary(userId: string, beneficiaryId: string) {
    const beneficiary = await this.prisma.beneficiary.findFirst({
      where: { id: beneficiaryId, userId },
    });

    if (!beneficiary) {
      throw new BadRequestException('Beneficiary not found');
    }

    await this.prisma.beneficiary.delete({
      where: { id: beneficiaryId },
    });

    return { success: true };
  }
}
