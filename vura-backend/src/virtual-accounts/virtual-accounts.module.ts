import { Module } from '@nestjs/common';
import { VirtualAccountsController } from './virtual-accounts.controller';
import { VirtualAccountsService } from './virtual-accounts.service';
import { PrismaService } from '../prisma.service';
import { FlutterwaveService } from '../services/flutterwave.service';
import { ConfigService } from '@nestjs/config';

@Module({
  controllers: [VirtualAccountsController],
  providers: [VirtualAccountsService, PrismaService, FlutterwaveService, ConfigService],
  exports: [VirtualAccountsService],
})
export class VirtualAccountsModule {}
