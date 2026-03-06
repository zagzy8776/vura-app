import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';
import { PeyflexService } from '../services/peyflex.service';
import { NellobyteService } from '../services/nellobyte.service';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [BillsController],
  providers: [BillsService, PeyflexService, NellobyteService, PrismaService],
  exports: [BillsService],
})
export class BillsModule {}
