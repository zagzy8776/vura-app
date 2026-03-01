import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { FlutterwaveService } from '../services/flutterwave.service';
import { decryptFromColumns } from '../utils/field-encryption';
import { decrypt } from '../utils/encryption';

@Injectable()
export class VirtualAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flutterwaveService: FlutterwaveService,
  ) {}

  async createOrGet(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        vuraTag: true,
        emailEncrypted: true,
        bvnVerified: true,
        bvnEncrypted: true,
        bvnIv: true,
        legalFirstName: true,
        legalLastName: true,
        reservedAccountNumber: true,
        reservedAccountBankName: true,
        flutterwaveOrderRef: true,
        flutterwaveRef: true,
      },
    });

    if (!user) throw new BadRequestException('User not found');

    // If already created, return it.
    if (user.reservedAccountNumber && user.reservedAccountBankName) {
      return {
        success: true,
        data: {
          accountNumber: user.reservedAccountNumber,
          bankName: user.reservedAccountBankName,
          accountName:
            `${user.legalFirstName ?? ''} ${user.legalLastName ?? ''}`.trim(),
          orderRef: user.flutterwaveOrderRef,
        },
      };
    }

    if (!user.bvnVerified) {
      throw new BadRequestException(
        'BVN must be verified before generating an account',
      );
    }

    if (!user.bvnEncrypted || !user.bvnIv) {
      throw new BadRequestException(
        'BVN not available. Please verify BVN again.',
      );
    }

    if (!user.legalFirstName || !user.legalLastName) {
      throw new BadRequestException(
        'Legal name not available. Please verify BVN again.',
      );
    }

    const bvn = decryptFromColumns(user.bvnEncrypted, user.bvnIv);

    const email = user.emailEncrypted ? decrypt(user.emailEncrypted) : '';
    if (!email) {
      // Flutterwave requires email; in your system it can be optional.
      // We enforce it here so the VA creation is deterministic.
      throw new BadRequestException(
        'Email is required to generate a virtual account',
      );
    }

    const result = await this.flutterwaveService.createVirtualAccountV4({
      userId: user.id,
      email,
      bvn,
      firstName: user.legalFirstName,
      lastName: user.legalLastName,
    });

    if (!result.success) {
      throw new BadRequestException(
        result.error || 'Failed to create virtual account',
      );
    }

    // Persist to DB
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        reservedAccountNumber: result.accountNumber,
        reservedAccountBankName: result.bankName,
        flutterwaveOrderRef: result.orderRef,
        flutterwaveRef: result.flutterwaveRef,
      },
    });

    return {
      success: true,
      data: {
        accountNumber: result.accountNumber,
        bankName: result.bankName,
        accountName: `${user.legalFirstName} ${user.legalLastName}`,
        orderRef: result.orderRef,
      },
    };
  }
}
