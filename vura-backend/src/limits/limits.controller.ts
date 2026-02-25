import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { LimitsService } from './limits.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('limits')
@UseGuards(AuthGuard)
export class LimitsController {
  constructor(private limitsService: LimitsService) {}

  @Get()
  async getMyLimits(@Request() req: any) {
    return this.limitsService.getUserLimits(req.user.userId);
  }
}
