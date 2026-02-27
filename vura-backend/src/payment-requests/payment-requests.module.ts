import { Module } from '@nestjs/common';
import { PaymentRequestsService } from './payment-requests.service';
import { PaymentRequestsController } from './payment-requests.controller';

@Module({
  providers: [PaymentRequestsService],
  controllers: [PaymentRequestsController],
  exports: [PaymentRequestsService],
})
export class PaymentRequestsModule {}
