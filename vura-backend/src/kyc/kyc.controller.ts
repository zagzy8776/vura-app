import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { BVNService } from './bvn.service';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma.service';
import { UnauthorizedException } from '@nestjs/common';

@Controller('kyc')
@UseGuards(AuthGuard)
export class KYCController {
  constructor(
    private bvnService: BVNService,
    private prisma: PrismaService,
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
}
