import { Module } from '@nestjs/common';
import { QrCodesService } from './qr-codes.service';
import { QrCodesController } from './qr-codes.controller';
import { PrismaService } from '../prisma.service';

@Module({
  providers: [QrCodesService, PrismaService],
  controllers: [QrCodesController],
  exports: [QrCodesService],
})
export class QrCodesModule {}
