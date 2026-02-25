import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('receipts')
@UseGuards(AuthGuard)
export class ReceiptsController {
  constructor(private receiptsService: ReceiptsService) {}

  @Get(':transactionId')
  async getReceipt(
    @Param('transactionId') transactionId: string,
    @Request() req: any,
  ) {
    const receipt = await this.receiptsService.generateReceipt(
      transactionId,
      req.user.userId,
    );
    return {
      success: true,
      data: receipt,
    };
  }

  @Get(':transactionId/verify')
  async verifyReceipt(@Param('transactionId') transactionId: string) {
    // Public endpoint to verify receipt authenticity
    return {
      success: true,
      message: 'Use POST with hash to verify',
    };
  }
}
