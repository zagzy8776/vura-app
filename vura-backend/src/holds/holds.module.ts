import { Module } from '@nestjs/common';
import { HoldsController } from './holds.controller';
import { HoldsService } from './holds.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [HoldsController],
  providers: [HoldsService, PrismaService],
  exports: [HoldsService],
})
export class HoldsModule {}
