import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';
import { FlutterwaveService } from '../services/flutterwave.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [BillsController],
  providers: [BillsService, FlutterwaveService, PrismaService],
  exports: [BillsService],
})
export class BillsModule {}
