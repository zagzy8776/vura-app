import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { BVNService } from './bvn.service';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma.service';
import { UnauthorizedException } from '@nestjs/common';
import { PremblySdkService } from '../services/prembly-sdk.service';
import { decrypt } from '../utils/encryption';

@Controller('kyc')
@UseGuards(AuthGuard)
export class KYCController {
  constructor(
    private bvnService: BVNService,
    private prisma: PrismaService,
    private premblySdk: PremblySdkService,
  ) {}

  @Post('verify-bvn')
  async verifyBVN(
    @Body() body: { bvn: string; firstName?: string; lastName?: string },
    @Request() req: { user?: { userId?: string } },
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    const result = await this.bvnService.verifyBVN(
      userId,
      body.bvn,
      body.firstName,
      body.lastName,
    );
    return {
      success: true,
      message: 'BVN consent initiated',
      data: result,
    };
  }

  @Post('complete-bvn')
  async completeBVN(
    @Body() body: { reference: string },
    @Request() req: { user?: { userId?: string } },
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    const result = await this.bvnService.completeBvnConsent(
      userId,
      body.reference,
    );
    return {
      success: true,
      message: 'BVN verification completed',
      data: result,
    };
  }

  @Get('bvn-status')
  async getBVNStatus(@Request() req: { user?: { userId?: string } }) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    const status = await this.bvnService.getBVNStatus(userId);
    return {
      success: true,
      data: status,
    };
  }

  @Get('status')
  async getKycStatus(@Request() req: { user?: { userId?: string } }) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        idType: true,
        idCardUrl: true,
        selfieUrl: true,
        kycStatus: true,
        kycTier: true,
        bvnVerified: true,
        kycRejectionReason: true,
      },
    });

    return user;
  }

  /**
   * Start Prembly SDK identity verification (document + selfie flow).
   * Returns sessionId and verificationUrl to open in popup or redirect.
   */
  @Post('prembly-sdk/initiate')
  async initiatePremblySdk(
    @Body() body: { firstName?: string; lastName?: string; email?: string },
    @Request() req: { user?: { userId?: string } },
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }

    if (!this.premblySdk.isConfigured()) {
      throw new BadRequestException(
        'Prembly SDK is not configured. Set PREMBLY_WIDGET_ID and PREMBLY_WIDGET_KEY in your backend environment.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        legalFirstName: true,
        legalLastName: true,
        emailEncrypted: true,
        vuraTag: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    let email = body.email?.trim();
    if (!email && user.emailEncrypted) {
      try {
        email = decrypt(user.emailEncrypted);
      } catch {
        email = `${user.vuraTag}@vura.app`;
      }
    }
    if (!email) {
      email = `${user.vuraTag}@vura.app`;
    }

    const firstName =
      body.firstName?.trim() ||
      user.legalFirstName?.trim() ||
      user.vuraTag ||
      'User';
    const lastName =
      body.lastName?.trim() || user.legalLastName?.trim() || 'Account';

    const result = await this.premblySdk.initiateSession({
      firstName,
      lastName,
      email,
      userRef: userId,
    });

    if (!result.success) {
      throw new BadRequestException(result.message || 'Failed to start verification.');
    }

    return {
      success: true,
      sessionId: result.sessionId,
      verificationUrl: result.verificationUrl,
    };
  }
}
