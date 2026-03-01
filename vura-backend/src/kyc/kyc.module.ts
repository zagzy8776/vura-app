import { Module } from '@nestjs/common';
import { KYCController } from './kyc.controller';
import { BVNService } from './bvn.service';
import { NINService } from './nin.service';
import { QoreIDService } from './qoreid.service';
import { PrismaService } from '../prisma.service';
import { FlutterwaveService } from '../services/flutterwave.service';
import { VirtualAccountsService } from '../virtual-accounts/virtual-accounts.service';

@Module({
  controllers: [KYCController],
  providers: [
    BVNService,
    NINService,
    QoreIDService,
    PrismaService,
    FlutterwaveService,
    VirtualAccountsService,
  ],
  exports: [BVNService, NINService, QoreIDService, FlutterwaveService],
})
export class KYCModule {}
