import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { BillsService } from './bills.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('bills')
@UseGuards(AuthGuard)
export class BillsController {
  constructor(private billsService: BillsService) {}

  // ── Airtime ─────────────────────────────────────────────────────────

  @Get('airtime/networks')
  async getAirtimeNetworks() {
    const networks = await this.billsService.getAirtimeNetworks();
    return { success: true, data: networks };
  }

  @Post('airtime')
  async buyAirtime(
    @Body() body: { phoneNumber: string; amount: number; network: string },
    @Request() req: any,
  ) {
    return this.billsService.buyAirtime(req.user.userId, {
      phoneNumber: body.phoneNumber,
      amount: body.amount,
      network: body.network,
    });
  }

  // ── Data ────────────────────────────────────────────────────────────

  @Get('data/networks')
  async getDataNetworks() {
    const networks = await this.billsService.getDataNetworks();
    return { success: true, data: networks };
  }

  @Get('data/plans')
  async getDataPlans(@Query('network') network: string) {
    const plans = await this.billsService.getDataPlans(network);
    return { success: true, data: plans };
  }

  @Post('data')
  async buyData(
    @Body() body: { phoneNumber: string; planCode: string; network: string },
    @Request() req: any,
  ) {
    return this.billsService.buyData(req.user.userId, {
      phoneNumber: body.phoneNumber,
      planCode: body.planCode,
      network: body.network,
    });
  }
}
