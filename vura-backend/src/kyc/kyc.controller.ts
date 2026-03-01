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
    @Body() body: { bvn: string },
    @Request() req: { user?: { userId?: string } },
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }
    const result = await this.bvnService.verifyBVN(userId, body.bvn);
    return {
      success: true,
      message: 'BVN verified successfully',
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
      },
    });

    return user;
  }
}
