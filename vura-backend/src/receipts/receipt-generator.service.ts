import { Injectable } from '@nestjs/common';

export interface ReceiptData {
  transactionReference: string;
  senderTag: string;
  receiverTag: string;
  amount: number;
  currency: string;
  fee: number;
  total: number;
  timestamp: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  description?: string;
}

@Injectable()
export class ReceiptGeneratorService {
  private readonly primaryColor = '#6366F1';

  /**
   * Generate HTML receipt for printing/PDF conversion
   * Frontend can use html2canvas or jspdf to convert to PDF
   */
  generateReceiptHTML(data: ReceiptData): string {
    const statusColor = this.getStatusColorHex(data.status);
    const statusBg = this.getStatusBgHex(data.status);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Vura Receipt - ${data.transactionReference}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; width: 400px; min-height: 600px; padding: 24px; background: #fff; margin: 0 auto; }
    .header { background: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%); padding: 32px 24px; text-align: center; border-radius: 16px 16px 0 0; margin: -24px -24px 24px -24px; position: relative; overflow: hidden; }
    .header::before { content: ''; position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%); }
    .logo { color: #fff; font-size: 32px; font-weight: 800; letter-spacing: -1px; position: relative; }
    .subtitle { color: rgba(255,255,255,0.85); font-size: 14px; margin-top: 6px; position: relative; }
    .status { display: inline-block; background: ${statusBg}; color: ${statusColor}; padding: 6px 18px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-top: 16px; text-transform: uppercase; letter-spacing: 0.5px; }
    .section { margin-bottom: 20px; }
    .label { color: #6B7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; font-weight: 500; }
    .value { color: #1F2937; font-size: 16px; font-weight: 600; }
    .amount { font-size: 32px; color: #1F2937; font-weight: 700; }
    .total { font-size: 24px; color: #6366F1; font-weight: 700; }
    .divider { height: 1px; background: linear-gradient(90deg, transparent, #E5E7EB, transparent); margin: 20px 0; }
    .footer { text-align: center; color: #9CA3AF; font-size: 11px; margin-top: 32px; padding-top: 20px; border-top: 1px dashed #E5E7EB; }
    .row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .arrow { text-align: center; color: #6366F1; font-size: 24px; margin: 12px 0; font-weight: 300; }
    .card { background: #F9FAFB; border-radius: 12px; padding: 16px; margin-bottom: 16px; border: 1px solid #E5E7EB; }
    .timestamp { color: #6B7280; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">VURA</div>
    <div class="subtitle">Transfer Receipt</div>
    <div class="status">${data.status}</div>
  </div>

  <div class="section">
    <div class="label">Transaction Reference</div>
    <div class="value" style="font-family: monospace; font-size: 13px;">${data.transactionReference}</div>
  </div>

  <div class="divider"></div>

  <div class="card">
    <div class="label">From</div>
    <div class="value">@${data.senderTag}</div>
  </div>

  <div class="arrow">↓</div>

  <div class="card">
    <div class="label">To</div>
    <div class="value">@${data.receiverTag}</div>
  </div>

  <div class="divider"></div>

  <div class="section">
    <div class="row">
      <span class="label">Amount</span>
      <span class="amount">${data.currency} ${data.amount.toLocaleString()}</span>
    </div>
    <div class="row">
      <span class="label">Fee</span>
      <span class="value">${data.currency} ${data.fee.toFixed(2)}</span>
    </div>
    <div class="divider"></div>
    <div class="row">
      <span class="label">Total</span>
      <span class="total">${data.currency} ${data.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
    </div>
  </div>

  ${data.description ? `
  <div class="card">
    <div class="label">Note</div>
    <div class="value">${data.description}</div>
  </div>
  ` : ''}

  <div class="divider"></div>

  <div class="timestamp">${data.timestamp}</div>

  <div class="footer">
    <strong>Powered by Vura</strong><br>
    Secure Banking for Africa<br>
    <span style="color: #9CA3AF; font-size: 10px;">www.vura.app</span>
  </div>
</body>
</html>`;
  }

  private getStatusColorHex(status: string): string {
    switch (status) {
      case 'SUCCESS': return '#065F46';
      case 'PENDING': return '#92400E';
      case 'FAILED': return '#991B1B';
      default: return '#374151';
    }
  }

  private getStatusBgHex(status: string): string {
    switch (status) {
      case 'SUCCESS': return '#D1FAE5';
      case 'PENDING': return '#FEF3C7';
      case 'FAILED': return '#FEE2E2';
      default: return '#F3F4F6';
    }
  }
}
