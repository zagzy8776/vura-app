import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KYCController } from './kyc.controller';
import { BVNService } from './bvn.service';
import { NINService } from './nin.service';
import { PrismaService } from '../prisma.service';
import { FlutterwaveService } from '../services/flutterwave.service';
import { PremblyService } from '../services/prembly.service';
import { VirtualAccountsService } from '../virtual-accounts/virtual-accounts.service';

@Module({
  imports: [ConfigModule],
  controllers: [KYCController],
  providers: [
    BVNService,
    NINService,
    PrismaService,
    FlutterwaveService,
    PremblyService,
    VirtualAccountsService,
  ],
  exports: [BVNService, NINService, FlutterwaveService],
})
export class KYCModule {}
