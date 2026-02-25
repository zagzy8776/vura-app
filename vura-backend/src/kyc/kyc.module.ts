import { Module } from '@nestjs/common';
import { KYCController } from './kyc.controller';
import { BVNService } from './bvn.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [KYCController],
  providers: [BVNService, PrismaService],
  exports: [BVNService],
})
export class KYCModule {}
