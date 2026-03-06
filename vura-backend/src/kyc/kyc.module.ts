import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KYCController } from './kyc.controller';
import { BVNService } from './bvn.service';
import { NINService } from './nin.service';
import { PrismaService } from '../prisma.service';
import { PremblyService } from '../services/prembly.service';
import { VirtualAccountsService } from '../virtual-accounts/virtual-accounts.service';

@Module({
  imports: [ConfigModule],
  controllers: [KYCController],
  providers: [
    BVNService,
    NINService,
    PrismaService,
    PremblyService,
    VirtualAccountsService,
  ],
  exports: [BVNService, NINService],
})
export class KYCModule {}
