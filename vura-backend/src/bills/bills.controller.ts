import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  BadRequestException,
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
    @Body() body: { meterNumber?: string; itemCode?: string; billerCode?: string },
  ) {
    const meterNumber = typeof body?.meterNumber === 'string' ? body.meterNumber.trim() : '';
    const itemCode = typeof body?.itemCode === 'string' ? body.itemCode.trim() : '';
    const billerCode = typeof body?.billerCode === 'string' ? body.billerCode.trim() : '';
    if (!meterNumber || meterNumber.length < 6) {
      throw new BadRequestException('Enter a valid meter number');
    }
    if (!billerCode) {
      throw new BadRequestException('Select a disco first');
    }
    return this.billsService.validateMeter({
      meterNumber,
      itemCode: itemCode || `${billerCode}-prepaid`,
      billerCode,
    });
  }

  @Post('electricity')
  async buyElectricity(
    @Body()
    body: {
      meterNumber?: string;
      amount?: number;
      disco?: string;
      type?: string;
      itemName?: string;
      itemCode?: string;
      fee?: number;
      phoneNumber?: string;
    },
    @Request() req: any,
  ) {
    const meterNumber = typeof body?.meterNumber === 'string' ? body.meterNumber.trim() : '';
    const amount = typeof body?.amount === 'number' ? body.amount : parseFloat(String(body?.amount ?? ''));
    const disco = typeof body?.disco === 'string' ? body.disco.trim() : '';
    const type = typeof body?.type === 'string' ? body.type.trim() : 'prepaid';
    const itemCode = typeof body?.itemCode === 'string' ? body.itemCode.trim() : '';
    const itemName = typeof body?.itemName === 'string' ? body.itemName.trim() : type;
    if (!meterNumber || meterNumber.length < 6) {
      throw new BadRequestException('Enter a valid meter number');
    }
    if (!disco) {
      throw new BadRequestException('Select a disco');
    }
    if (!Number.isFinite(amount) || amount < 500) {
      throw new BadRequestException('Minimum electricity purchase is ₦500');
    }
    if (amount > 500000) {
      throw new BadRequestException('Maximum electricity purchase is ₦500,000');
    }
    return this.billsService.buyElectricity(req.user.userId, {
      meterNumber,
      amount,
      disco,
      type,
      itemName,
      itemCode: itemCode || `${disco}-${type}`,
      fee: body?.fee,
      phoneNumber: body?.phoneNumber,
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
    @Body() body: { cableTv?: string; smartCardNo?: string },
  ) {
    const cableTv = typeof body?.cableTv === 'string' ? body.cableTv.trim() : '';
    const smartCardNo = typeof body?.smartCardNo === 'string' ? body.smartCardNo.trim() : '';
    return this.billsService.validateCableSmartcard(cableTv || 'dstv', smartCardNo);
  }

  @Post('cable')
  async buyCableTV(
    @Body() body: { cableTv?: string; packageCode?: string; smartCardNo?: string; phoneNumber?: string },
    @Request() req: any,
  ) {
    const cableTv = typeof body?.cableTv === 'string' ? body.cableTv.trim() : 'dstv';
    const packageCode = typeof body?.packageCode === 'string' ? body.packageCode.trim() : '';
    const smartCardNo = typeof body?.smartCardNo === 'string' ? body.smartCardNo.trim() : '';
    if (!packageCode) {
      throw new BadRequestException('Select a package');
    }
    if (!smartCardNo || smartCardNo.length < 5) {
      throw new BadRequestException('Enter a valid smartcard number');
    }
    return this.billsService.buyCableTV(req.user.userId, {
      cableTv,
      packageCode,
      smartCardNo,
      phoneNumber: body?.phoneNumber || '08000000000',
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
    @Body() body: { company?: string; customerId?: string },
  ) {
    const company = typeof body?.company === 'string' ? body.company.trim() : '';
    const customerId = typeof body?.customerId === 'string' ? body.customerId.trim() : '';
    return this.billsService.validateBettingCustomer(company, customerId);
  }

  @Post('betting')
  async buyBetting(
    @Body() body: { company?: string; customerId?: string; amount?: number },
    @Request() req: any,
  ) {
    const company = typeof body?.company === 'string' ? body.company.trim() : '';
    const customerId = typeof body?.customerId === 'string' ? body.customerId.trim() : '';
    const amount =
      typeof body?.amount === 'number'
        ? body.amount
        : typeof body?.amount === 'string'
          ? parseFloat(String(body.amount))
          : NaN;

    if (!company) {
      throw new BadRequestException('Select a betting company');
    }
    if (!customerId || customerId.length < 3) {
      throw new BadRequestException('Enter your betting account ID (at least 3 characters)');
    }
    if (!Number.isFinite(amount) || amount < 100) {
      throw new BadRequestException('Minimum betting amount is ₦100');
    }

    return this.billsService.buyBetting(req.user.userId, {
      company,
      customerId,
      amount,
    });
  }
}
