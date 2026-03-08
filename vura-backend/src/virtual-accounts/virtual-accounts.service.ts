import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { PaystackService } from '../services/paystack.service';
import { KorapayService } from '../services/korapay.service';
import { decrypt } from '../utils/encryption';
import { decryptFromColumns } from '../utils/field-encryption';

@Injectable()
export class VirtualAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paystackService: PaystackService,
    private readonly korapayService: KorapayService,
    private readonly config: ConfigService,
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
        bvnEncrypted: true,
        bvnIv: true,
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

    const accountName = `${effectiveFirstName} ${effectiveLastName}`.trim() || `${user.vuraTag || 'Vura'} Account`;

    // Prefer Korapay when configured (no Paystack DVA required)
    if (this.korapayService.isConfigured()) {
      if (!user.bvnEncrypted || !user.bvnIv) {
        throw new BadRequestException(
          'BVN is required to generate your virtual account. Complete identity verification in Settings.',
        );
      }
      let bvn: string;
      try {
        bvn = decryptFromColumns(user.bvnEncrypted, user.bvnIv);
      } catch {
        throw new BadRequestException(
          'Could not verify your details. Please complete identity verification again in Settings.',
        );
      }
      const bankCode =
        this.config.get<string>('KORAPAY_VBA_BANK_CODE') || '035';
      const korapayResult = await this.korapayService.createVirtualBankAccount({
        account_name: accountName,
        account_reference: user.id,
        permanent: true,
        bank_code: bankCode,
        customer: {
          name: accountName,
          email: user.emailEncrypted ? decrypt(user.emailEncrypted) : undefined,
        },
        kyc: { bvn },
      });
      if (!korapayResult.success) {
        throw new BadRequestException(
          korapayResult.error || 'Failed to create virtual account',
        );
      }
      const k = korapayResult.data;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          reservedAccountNumber: k.account_number,
          reservedAccountBankName: k.bank_name,
          korapayReference: k.unique_id,
        },
      });
      return {
        success: true,
        data: {
          accountNumber: k.account_number,
          bankName: k.bank_name,
          accountName: k.account_name,
          orderRef: k.unique_id,
        },
      };
    }

    // Fallback: Paystack Dedicated Virtual Account
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
    let result = await this.paystackService.createDedicatedAccount({
      customerCode,
    });
    if (!result.success) {
      const banks = await this.paystackService.getDvaAvailableBanks();
      for (let i = 1; i < banks.length && !result.success; i++) {
        result = await this.paystackService.createDedicatedAccount({
          customerCode,
          preferredBank: banks[i].provider_slug,
        });
      }
    }
    if (!result.success) {
      const raw = (result.error || '').toLowerCase();
      const isPaystackDvaDisabled =
        raw.includes('dedicated') ||
        raw.includes('nuban') ||
        raw.includes('not available') ||
        raw.includes('not available for this business');
      const message = isPaystackDvaDisabled
        ? 'Bank account generation is temporarily unavailable. Please try again later or contact support.'
        : result.error || 'Failed to create virtual account';
      throw new BadRequestException(message);
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
        accountName,
        orderRef: customerCode,
      },
    };
  }
}
