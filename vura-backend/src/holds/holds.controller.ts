import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { HoldsService } from './holds.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('holds')
@UseGuards(AuthGuard)
export class HoldsController {
  constructor(private holdsService: HoldsService) {}

  @Get()
  async getHeldTransactions() {
    return this.holdsService.getHeldTransactions();
  }

  @Post(':id/release')
  async releaseHold(@Param('id') id: string, @Request() req: any) {
    // TODO: Add admin role check
    await this.holdsService.releaseHold(id, req.user.userId);
    return { success: true, message: 'Hold released successfully' };
  }

  @Post('check-auto-release')
  async checkAutoRelease() {
    const released = await this.holdsService.checkAutoRelease();
    return { released, message: `${released} transactions auto-released` };
  }
}
