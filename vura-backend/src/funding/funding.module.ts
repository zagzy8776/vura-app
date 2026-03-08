import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FundingController } from './funding.controller';
import { PaystackService } from '../services/paystack.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [FundingController],
  providers: [PaystackService, PrismaService],
})
export class FundingModule {}
