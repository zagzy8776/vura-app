import { Module } from '@nestjs/common';
import { VirtualAccountsController } from './virtual-accounts.controller';
import { VirtualAccountsService } from './virtual-accounts.service';
import { PrismaService } from '../prisma.service';
import { PaystackService } from '../services/paystack.service';

@Module({
  controllers: [VirtualAccountsController],
  providers: [VirtualAccountsService, PrismaService, PaystackService],
  exports: [VirtualAccountsService],
})
export class VirtualAccountsModule {}
