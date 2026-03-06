import { Controller, Post, UseGuards, Request } from '@nestjs/common';
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
