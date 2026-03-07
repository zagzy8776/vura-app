import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PaystackService } from '../services/paystack.service';
import { decrypt } from '../utils/encryption';

@Injectable()
export class VirtualAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paystackService: PaystackService,
  ) {}

  async createOrGet(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        vuraTag: true,
        emailEncrypted: true,
        phoneEncrypted: true,
        bvnVerified: true,
        kycTier: true,
        kycStatus: true,
        legalFirstName: true,
        legalLastName: true,
        reservedAccountNumber: true,
        reservedAccountBankName: true,
        paystackCustomerCode: true,
      },
    });

    if (!user) throw new BadRequestException('User not found');

    if (user.reservedAccountNumber && user.reservedAccountBankName) {
      const accountName =
        `${user.legalFirstName ?? ''} ${user.legalLastName ?? ''}`.trim() ||
        `${user.vuraTag || 'Vura'} Account`;
      return {
        success: true,
        data: {
          accountNumber: user.reservedAccountNumber,
          bankName: user.reservedAccountBankName,
          accountName,
          orderRef: user.paystackCustomerCode ?? undefined,
        },
      };
    }

    const canCreateAccount =
      user.bvnVerified ||
      (user.kycStatus === 'VERIFIED' && user.kycTier >= 2);
    if (!canCreateAccount) {
      throw new BadRequestException(
        'Complete identity verification first. Go to Settings → Identity verification.',
      );
    }

    // Use legal name from profile, or fallback so approved users can still get a VA (e.g. admin approved without names)
    const effectiveFirstName =
      (user.legalFirstName && user.legalFirstName.trim()) || user.vuraTag || 'Vura';
    const effectiveLastName =
      (user.legalLastName && user.legalLastName.trim()) || 'Account';

    const email = user.emailEncrypted ? decrypt(user.emailEncrypted) : '';
    if (!email) {
      throw new BadRequestException(
        'Email is required to generate a virtual account',
      );
    }

    let customerCode = user.paystackCustomerCode;
    if (!customerCode) {
      let phone: string | undefined;
      try {
        phone = user.phoneEncrypted ? decrypt(user.phoneEncrypted) : undefined;
      } catch {
        phone = undefined;
      }
      const customer = await this.paystackService.createCustomer({
        email,
        firstName: effectiveFirstName,
        lastName: effectiveLastName,
        phone,
      });
      if (!customer) {
        throw new BadRequestException(
          'Could not create Paystack customer. Please try again or contact support.',
        );
      }
      customerCode = customer.customerCode;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { paystackCustomerCode: customerCode },
      });
    }

    const result = await this.paystackService.createDedicatedAccount({
      customerCode,
    });

    if (!result.success) {
      throw new BadRequestException(
        result.error || 'Failed to create virtual account',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        reservedAccountNumber: result.accountNumber,
        reservedAccountBankName: result.bankName,
      },
    });

    return {
      success: true,
      data: {
        accountNumber: result.accountNumber,
        bankName: result.bankName,
        accountName: `${effectiveFirstName} ${effectiveLastName}`,
        orderRef: customerCode,
      },
    };
  }
}
