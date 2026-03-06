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

  // ── Electricity ──────────────────────────────────────────────────────

  @Get('electricity/discos')
  async getElectricityDiscos() {
    const discos = await this.billsService.getElectricityDiscos();
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

  // ── Cable TV ───────────────────────────────────────────────────────────

  @Get('cable/providers')
  async getCableProviders() {
    const providers = await this.billsService.getCableProviders();
    return { success: true, data: providers };
  }

  @Get('cable/packages')
  async getCablePackages(@Query('provider') provider: string) {
    const packages = await this.billsService.getCablePackages(provider);
    return { success: true, data: packages };
  }

  @Post('cable/validate')
  async validateCableSmartcard(
    @Body() body: { cableTv: string; smartCardNo: string },
  ) {
    return this.billsService.validateCableSmartcard(body.cableTv, body.smartCardNo);
  }

  @Post('cable')
  async buyCableTV(
    @Body() body: { cableTv: string; packageCode: string; smartCardNo: string; phoneNumber?: string },
    @Request() req: any,
  ) {
    return this.billsService.buyCableTV(req.user.userId, {
      cableTv: body.cableTv,
      packageCode: body.packageCode,
      smartCardNo: body.smartCardNo,
      phoneNumber: body.phoneNumber || '08000000000',
    });
  }

  // ── Betting ───────────────────────────────────────────────────────────

  @Get('betting/companies')
  async getBettingCompanies() {
    const companies = await this.billsService.getBettingCompanies();
    return { success: true, data: companies };
  }

  @Post('betting/validate')
  async validateBettingCustomer(
    @Body() body: { company: string; customerId: string },
  ) {
    return this.billsService.validateBettingCustomer(body.company, body.customerId);
  }

  @Post('betting')
  async buyBetting(
    @Body() body: { company: string; customerId: string; amount: number },
    @Request() req: any,
  ) {
    return this.billsService.buyBetting(req.user.userId, {
      company: body.company,
      customerId: body.customerId,
      amount: body.amount,
    });
  }
}
