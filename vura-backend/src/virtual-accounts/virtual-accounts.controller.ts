import { Controller, Post, Get, UseGuards, Request, NotFoundException } from '@nestjs/common';
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
   * Get existing virtual account if any. Does not create. Returns 404 if none.
   * GET /virtual-accounts
   */
  @Get()
  async get(@Request() req: ExpressRequest & { user: { userId: string } }) {
    const result = await this.virtualAccountsService.getExisting(req.user.userId);
    if (!result) throw new NotFoundException('No virtual account');
    return result;
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
