import { Controller, Get, Post, Param, UseGuards, Request } from '@nestjs/common';
import { EWSService } from './ews.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('ews')
@UseGuards(AuthGuard)
export class EWSController {
  constructor(private ewsService: EWSService) {}

  @Get('risk-status')
  async getMyRiskStatus(@Request() req: any) {
    return this.ewsService.getUserRiskStatus(req.user.userId);
  }

  @Post('unfreeze/:userId')
  async unfreezeAccount(
    @Param('userId') userId: string,
    @Request() req: any,
    // TODO: Add admin role check
  ) {
    await this.ewsService.unfreezeAccount(userId, req.user.userId, 'Manual admin unfreeze');
    return { success: true, message: 'Account unfrozen' };
  }
}
