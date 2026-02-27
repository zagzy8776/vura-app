import { Module } from '@nestjs/common';
import { EWSController } from './ews.controller';
import { EWSService } from '../services/ews.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [EWSController],
  providers: [EWSService, PrismaService],
  exports: [EWSService],
})
export class EWSModule {}
