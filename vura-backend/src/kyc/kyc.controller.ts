import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { BVNService } from './bvn.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('kyc')
@UseGuards(AuthGuard)
export class KYCController {
  constructor(private bvnService: BVNService) {}

  @Post('verify-bvn')
  async verifyBVN(@Body() body: { bvn: string }, @Request() req: any) {
    const result = await this.bvnService.verifyBVN(req.user.userId, body.bvn);
    return {
      success: true,
      message: 'BVN verified successfully',
      data: result,
    };
  }

  @Get('bvn-status')
  async getBVNStatus(@Request() req: any) {
    const status = await this.bvnService.getBVNStatus(req.user.userId);
    return {
      success: true,
      data: status,
    };
  }
}
