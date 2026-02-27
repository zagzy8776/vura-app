import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { QrCodesService } from './qr-codes.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('qr-codes')
@UseGuards(AuthGuard)
export class QrCodesController {
  constructor(private readonly qrCodesService: QrCodesService) {}

  /**
   * Generate a new QR payment code
   * POST /qr-codes/generate
   */
  @Post('generate')
  async generateQrCode(
    @Request() req,
    @Body() body: { amount?: number; description?: string; expiresInMinutes?: number },
  ) {
    return this.qrCodesService.generateQrCode(
      req.user.userId,
      body.amount,
      body.description,
      body.expiresInMinutes,
    );
  }

  /**
   * Validate a QR code (for customer scanning)
   * POST /qr-codes/validate
   */
  @Post('validate')
  async validateQrCode(@Body() body: { code: string }) {
    return this.qrCodesService.validateQrCode(body.code);
  }

  /**
   * Process QR code payment (after security countdown)
   * POST /qr-codes/pay
   */
  @Post('pay')
  async processQrPayment(
    @Request() req,
    @Body() body: { code: string; amount: number; pin: string },
  ) {
    return this.qrCodesService.processQrPayment(
      req.user.userId,
      body.code,
      body.amount,
      body.pin,
    );
  }

  /**
   * Get merchant's QR code history
   * GET /qr-codes/history
   */
  @Get('history')
  async getQrCodeHistory(@Request() req, @Body() body: { status?: string }) {
    return this.qrCodesService.getMerchantQrCodes(req.user.userId, body?.status);
  }

  /**
   * Revoke a QR code
   * POST /qr-codes/:id/revoke
   */
  @Post(':id/revoke')
  async revokeQrCode(@Request() req, @Param('id') qrCodeId: string) {
    return this.qrCodesService.revokeQrCode(req.user.userId, qrCodeId);
  }
}
