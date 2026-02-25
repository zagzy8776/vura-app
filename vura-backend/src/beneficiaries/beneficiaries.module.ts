import { Module } from '@nestjs/common';
import { BeneficiariesController } from './beneficiaries.controller';
import { BeneficiariesService } from './beneficiaries.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [BeneficiariesController],
  providers: [BeneficiariesService, PrismaService],
  exports: [BeneficiariesService],
})
export class BeneficiariesModule {}
