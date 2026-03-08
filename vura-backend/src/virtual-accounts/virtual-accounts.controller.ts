import { Controller, Post, Get, UseGuards, Request } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { VirtualAccountsService } from './virtual-accounts.service';

@Controller('virtual-accounts')
@UseGuards(AuthGuard)
export class VirtualAccountsController {
  constructor(
    private readonly virtualAccountsService: VirtualAccountsService,
  ) {}

  /**
   * Get existing virtual account if any. Does not create. Returns 200 with data: null when none (so frontend does not 404).
   * GET /virtual-accounts
   */
  @Get()
  async get(@Request() req: ExpressRequest & { user: { userId: string } }) {
    const result = await this.virtualAccountsService.getExisting(req.user.userId);
    return result ?? { success: true, data: null };
  }

  /**
   * Create (or fetch existing) Paystack Dedicated Virtual Account for the user.
   * POST /virtual-accounts/create
   */
  @Post('create')
  async createOrGet(
    @Request() req: ExpressRequest & { user: { userId: string } },
  ) {
    return this.virtualAccountsService.createOrGet(req.user.userId);
  }
}
