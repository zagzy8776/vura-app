import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PaymentRequestsService } from './payment-requests.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('payment-requests')
@UseGuards(AuthGuard)
export class PaymentRequestsController {
  constructor(private readonly paymentRequestsService: PaymentRequestsService) {}

  /**
   * Create a payment request
   * POST /payment-requests/create
   */
  @Post('create')
  async createRequest(
    @Request() req,
    @Body()
    body: {
      payerVuraTag: string;
      amount: number;
      description?: string;
      expiresInMinutes?: number;
    },
  ) {
    return this.paymentRequestsService.createRequest(
      req.user.userId,
      body.payerVuraTag,
      body.amount,
      body.description,
      body.expiresInMinutes,
    );
  }

  /**
   * Get pending requests (as payer - incoming requests)
   * GET /payment-requests/pending
   */
  @Get('pending')
  async getPendingRequests(@Request() req) {
    return this.paymentRequestsService.getPendingRequests(req.user.userId);
  }

  /**
   * Get my requests (as requester - outgoing requests)
   * GET /payment-requests/my-requests
   */
  @Get('my-requests')
  async getMyRequests(@Request() req, @Body() body: { status?: string }) {
    return this.paymentRequestsService.getMyRequests(req.user.userId, body?.status);
  }

  /**
   * Accept a payment request
   * POST /payment-requests/:id/accept
   */
  @Post(':id/accept')
  async acceptRequest(
    @Request() req,
    @Param('id') requestId: string,
    @Body() body: { pin: string },
  ) {
    return this.paymentRequestsService.acceptRequest(
      req.user.userId,
      requestId,
      body.pin,
    );
  }

  /**
   * Decline a payment request
   * POST /payment-requests/:id/decline
   */
  @Post(':id/decline')
  async declineRequest(@Request() req, @Param('id') requestId: string) {
    return this.paymentRequestsService.declineRequest(req.user.userId, requestId);
  }
}
