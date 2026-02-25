import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { BeneficiariesService } from './beneficiaries.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('beneficiaries')
@UseGuards(AuthGuard)
export class BeneficiariesController {
  constructor(private beneficiariesService: BeneficiariesService) {}

  @Post()
  async addBeneficiary(
    @Body()
    body: {
      name: string;
      vuraTag?: string;
      accountNumber?: string;
      bankCode?: string;
      bankName?: string;
      type: 'vura' | 'bank';
    },
    @Request() req: any,
  ) {
    const beneficiary = await this.beneficiariesService.addBeneficiary(
      req.user.userId,
      body,
    );
    return {
      success: true,
      data: beneficiary,
    };
  }

  @Get()
  async getBeneficiaries(@Request() req: any) {
    const beneficiaries = await this.beneficiariesService.getBeneficiaries(
      req.user.userId,
    );
    return {
      success: true,
      data: beneficiaries,
    };
  }

  @Put(':id')
  async updateBeneficiary(
    @Param('id') id: string,
    @Body() body: { name?: string; isFavorite?: boolean },
    @Request() req: any,
  ) {
    const beneficiary = await this.beneficiariesService.updateBeneficiary(
      req.user.userId,
      id,
      body,
    );
    return {
      success: true,
      data: beneficiary,
    };
  }

  @Delete(':id')
  async deleteBeneficiary(@Param('id') id: string, @Request() req: any) {
    await this.beneficiariesService.deleteBeneficiary(req.user.userId, id);
    return {
      success: true,
      message: 'Beneficiary deleted',
    };
  }
}
