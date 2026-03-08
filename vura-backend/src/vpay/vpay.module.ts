import { Module } from '@nestjs/common';
import { VpayService } from '../services/vpay.service';

@Module({
  providers: [VpayService],
  exports: [VpayService],
})
export class VpayModule {}
