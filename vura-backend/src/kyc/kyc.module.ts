import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KYCController } from './kyc.controller';
import { BVNService } from './bvn.service';
import { NINService } from './nin.service';
import { PrismaService } from '../prisma.service';
import { PremblyService } from '../services/prembly.service';
import { PremblySdkService } from '../services/prembly-sdk.service';
import { VirtualAccountsModule } from '../virtual-accounts/virtual-accounts.module';

@Module({
  imports: [ConfigModule, VirtualAccountsModule],
  controllers: [KYCController],
  providers: [BVNService, NINService, PrismaService, PremblyService, PremblySdkService],
  exports: [BVNService, NINService],
})
export class KYCModule {}
