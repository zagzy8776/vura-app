import {
  Controller,
  Get,
  Post,
  Body,
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
  getAirtimeNetworks() {
    const networks = this.billsService.getAirtimeNetworks();
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
  getDataNetworks() {
    const networks = this.billsService.getDataNetworks();
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

  // ── Electricity ──────────────────────────────────────────────────────

  @Get('electricity/discos')
  getElectricityDiscos() {
    const discos = this.billsService.getElectricityDiscos();
    return { success: true, data: discos };
  }

  @Get('electricity/items')
  async getElectricityItems(@Query('disco') disco: string) {
    const items = await this.billsService.getElectricityItems(disco);
    return { success: true, data: items };
  }

  @Post('electricity/validate')
  async validateMeter(
    @Body() body: { meterNumber: string; itemCode: string; billerCode: string },
  ) {
    return this.billsService.validateMeter({
      meterNumber: body.meterNumber,
      itemCode: body.itemCode,
      billerCode: body.billerCode,
    });
  }

  @Post('electricity')
  async buyElectricity(
    @Body()
    body: {
      meterNumber: string;
      amount: number;
      disco: string;
      type: string;
      itemName: string;
      itemCode: string;
    },
    @Request() req: any,
  ) {
    return this.billsService.buyElectricity(req.user.userId, {
      meterNumber: body.meterNumber,
      amount: body.amount,
      disco: body.disco,
      type: body.type,
      itemName: body.itemName,
      itemCode: body.itemCode,
    });
  }
}
