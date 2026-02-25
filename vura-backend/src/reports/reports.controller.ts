import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import type { Response } from 'express';

import { ReportsService } from './reports.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('reports')
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('daily-transactions')
  async getDailyTransactions(
    @Query('date') date: string,
    @Res() res: Response,
  ) {
    const reportDate = date ? new Date(date) : new Date();
    const csv = await this.reportsService.generateDailyTransactionReport(reportDate);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="daily-transactions-${reportDate.toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  }

  @Get('kyc-compliance')
  async getKYCCompliance(@Res() res: Response) {
    const csv = await this.reportsService.generateKYCComplianceReport();
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="kyc-compliance-report.csv"');
    res.send(csv);
  }

  @Get('suspicious-activity')
  async getSAR(@Res() res: Response) {
    const csv = await this.reportsService.generateSARReport();
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="suspicious-activity-report.csv"');
    res.send(csv);
  }

  @Get('large-transactions')
  async getLargeTransactions(@Res() res: Response) {
    const csv = await this.reportsService.generateLargeTransactionReport();
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="large-transactions-report.csv"');
    res.send(csv);
  }

  @Get('dashboard-stats')
  async getDashboardStats() {
    return this.reportsService.getDashboardStats();
  }
}
