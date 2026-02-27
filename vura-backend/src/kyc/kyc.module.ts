import { Module } from '@nestjs/common';
import { KYCController } from './kyc.controller';
import { BVNService } from './bvn.service';
import { NINService } from './nin.service';
import { QoreIDService } from './qoreid.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [KYCController],
  providers: [BVNService, NINService, QoreIDService, PrismaService],
  exports: [BVNService, NINService, QoreIDService],
})
export class KYCModule {}
