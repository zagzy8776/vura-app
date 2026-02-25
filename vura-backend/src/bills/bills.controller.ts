import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { BillsService } from './bills.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('bills')
@UseGuards(AuthGuard)
export class BillsController {
  constructor(private billsService: BillsService) {}

  // Airtime
  @Post('airtime')
  async buyAirtime(
    @Body() body: { phoneNumber: string; amount: number; network: string },
    @Request() req: any,
  ) {
    const result = await this.billsService.buyAirtime(req.user.userId, {
      phoneNumber: body.phoneNumber,
      amount: body.amount,
      network: body.network as any,
    });
    return result;
  }

  // Data
  @Get('data-plans/:network')
  async getDataPlans(@Param('network') network: string) {
    const plans = await this.billsService.getDataPlans(network);
    return { success: true, data: plans };
  }

  @Post('data')
  async buyData(
    @Body()
    body: { phoneNumber: string; planCode: string; network: string },
    @Request() req: any,
  ) {
    const result = await this.billsService.buyData(req.user.userId, {
      phoneNumber: body.phoneNumber,
      planCode: body.planCode,
      network: body.network as any,
    });
    return result;
  }

  // Electricity
  @Get('electricity/discos')
  async getDiscos() {
    const discos = await this.billsService.getDiscos();
    return { success: true, data: discos };
  }

  @Post('electricity')
  async payElectricity(
    @Body()
    body: { meterNumber: string; disco: string; amount: number },
    @Request() req: any,
  ) {
    const result = await this.billsService.payElectricity(req.user.userId, {
      meterNumber: body.meterNumber,
      disco: body.disco as any,
      amount: body.amount,
    });
    return result;
  }

  // Cable TV
  @Get('cable/packages/:provider')
  async getCablePackages(@Param('provider') provider: string) {
    const packages = await this.billsService.getCablePackages(provider);
    return { success: true, data: packages };
  }

  @Post('cable')
  async payCable(
    @Body()
    body: { smartCardNumber: string; provider: string; package: string },
    @Request() req: any,
  ) {
    const result = await this.billsService.payCable(req.user.userId, {
      smartCardNumber: body.smartCardNumber,
      provider: body.provider as any,
      package: body.package,
    });
    return result;
  }
}
