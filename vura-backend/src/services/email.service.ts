import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { PrismaService } from '../prisma.service';
import { decrypt } from '../utils/encryption';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly fromEmail: string;
  private readonly emailEnabled: boolean;

  constructor(private readonly prisma: PrismaService) {
    const apiKey = process.env.RESEND_API_KEY;
    this.fromEmail = process.env.FROM_EMAIL || 'security@vura.app';
    
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY not set - emails will not be sent');
      this.resend = null;
      this.emailEnabled = false;
    } else {
      this.resend = new Resend(apiKey);
      this.emailEnabled = true;
    }
  }

  /**
   * Check if email sending is enabled
   */
  isEmailEnabled(): boolean {
    return this.emailEnabled;
  }

  /**
   * Send OTP email for new device verification (Login)
   */
  async sendDeviceVerificationOtp(
    userId: string,
    otp: string,
    deviceInfo: { browser: string; os: string; ip?: string },
  ): Promise<boolean> {
    if (!this.emailEnabled || !this.resend) {
      this.logger.warn('Email service not configured - skipping OTP email');
      return false;
    }

    try {
      // Get user email
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { emailEncrypted: true, vuraTag: true },
      });

      if (!user?.emailEncrypted) {
        this.logger.warn(`User ${userId} has no email - cannot send OTP`);
        return false;
      }

      // Decrypt email
      const email = decrypt(user.emailEncrypted);

      // Build email content
      const subject = '🔒 Vura Security - Login Verification Required';
      const html = this.buildLoginOtpEmailTemplate({
        vuraTag: user.vuraTag,
        otp,
        deviceInfo,
        expiresIn: '10 minutes',
      });

      // Send email
      const result = await this.resend.emails.send({
        from: `Vura Security <${this.fromEmail}>`,
        to: email,
        subject,
        html,
      });

      if (result.error) {
        this.logger.error('Failed to send OTP email:', result.error);
        return false;
      }

      this.logger.log(`Login OTP email sent to ${email} for user ${userId}`);
      return true;
    } catch (error) {
      this.logger.error('Error sending OTP email:', error);
      return false;
    }
  }

  /**
   * Send OTP email for registration verification
   */
  async sendRegistrationOtp(
    userId: string,
    otp: string,
    deviceInfo: { browser: string; os: string; ip?: string },
  ): Promise<boolean> {
    if (!this.emailEnabled || !this.resend) {
      this.logger.warn('Email service not configured - skipping registration OTP email');
      return false;
    }

    try {
      // Get user email
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { emailEncrypted: true, vuraTag: true },
      });

      if (!user?.emailEncrypted) {
        this.logger.warn(`User ${userId} has no email - cannot send registration OTP`);
        return false;
      }

      // Decrypt email
      const email = decrypt(user.emailEncrypted);

      // Build email content
      const subject = '🎉 Welcome to Vura - Complete Your Registration';
      const html = this.buildRegistrationOtpEmailTemplate({
        vuraTag: user.vuraTag,
        otp,
        deviceInfo,
        expiresIn: '15 minutes',
      });

      // Send email
      const result = await this.resend.emails.send({
        from: `Vura Security <${this.fromEmail}>`,
        to: email,
        subject,
        html,
      });

      if (result.error) {
        this.logger.error('Failed to send registration OTP email:', result.error);
        return false;
      }

      this.logger.log(`Registration OTP email sent to ${email} for user ${userId}`);
      return true;
    } catch (error) {
      this.logger.error('Error sending registration OTP email:', error);
      return false;
    }
  }

  /**
   * Send transaction notification email
   */
  async sendTransactionNotification(
    userId: string,
    transaction: {
      type: 'debit' | 'credit';
      amount: number;
      currency: string;
      description: string;
      reference: string;
      counterparty?: string;
      balanceAfter: number;
    },
  ): Promise<boolean> {
    if (!this.emailEnabled || !this.resend) {
      this.logger.warn('Email service not configured - skipping transaction notification');
      return false;
    }

    try {
      // Get user email
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { emailEncrypted: true, vuraTag: true },
      });

      if (!user?.emailEncrypted) {
        this.logger.warn(`User ${userId} has no email - cannot send transaction notification`);
        return false;
      }

      // Decrypt email
      const email = decrypt(user.emailEncrypted);

      // Build email content
      const subject =
        transaction.type === 'credit'
          ? `💰 Vura - Credit Alert: +${transaction.currency}${transaction.amount.toLocaleString()}`
          : `💸 Vura - Debit Alert: -${transaction.currency}${transaction.amount.toLocaleString()}`;
      
      const html = this.buildTransactionEmailTemplate({
        vuraTag: user.vuraTag,
        transaction,
      });

      // Send email
      const result = await this.resend.emails.send({
        from: `Vura Security <${this.fromEmail}>`,
        to: email,
        subject,
        html,
      });

      if (result.error) {
        this.logger.error('Failed to send transaction notification:', result.error);
        return false;
      }

      this.logger.log(
        `Transaction notification sent to ${email} for user ${userId}`,
      );
      return true;
    } catch (error) {
      this.logger.error('Error sending transaction notification:', error);
      return false;
    }
  }

  /**
   * Send security alert for suspicious activity
   */
  async sendSecurityAlert(
    userId: string,
    alertType: 'new_device' | 'suspicious_login' | 'large_transaction',
    details: Record<string, any>,
  ): Promise<boolean> {
    if (!this.emailEnabled || !this.resend) {
      this.logger.warn(
        'Email service not configured - skipping security alert',
      );
      return false;
    }

    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { emailEncrypted: true, vuraTag: true },
      });

      if (!user?.emailEncrypted) return false;

      const email = decrypt(user.emailEncrypted);

      const subject = this.getAlertSubject(alertType);
      const html = this.buildSecurityAlertTemplate({
        vuraTag: user.vuraTag,
        alertType,
        details,
      });

      const result = await this.resend.emails.send({
        from: `Vura Security <${this.fromEmail}>`,
        to: email,
        subject,
        html,
      });

      return !result.error;
    } catch (error) {
      this.logger.error('Error sending security alert:', error);
      return false;
    }
  }

  /**
   * Build OTP email HTML template
   */
  private buildOtpEmailTemplate(params: {
    vuraTag: string;
    otp: string;
    deviceInfo: { browser: string; os: string; ip?: string };
    expiresIn: string;
  }): string {
    const { vuraTag, otp, deviceInfo, expiresIn } = params;
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vura Security Code</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { background: #f9fafb; border-radius: 12px; padding: 32px; }
    .header { text-align: center; margin-bottom: 24px; }
    .logo { font-size: 28px; font-weight: bold; color: #7c3aed; }
    .otp-box { background: #7c3aed; color: white; font-size: 32px; font-weight: bold; text-align: center; padding: 24px; border-radius: 8px; letter-spacing: 8px; margin: 24px 0; }
    .device-info { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .device-info p { margin: 8px 0; font-size: 14px; color: #6b7280; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 16px 0; border-radius: 4px; }
    .footer { text-align: center; font-size: 12px; color: #9ca3af; margin-top: 32px; }
    .button { display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Vura</div>
    </div>
    
    <h2>Hi @${vuraTag},</h2>
    
    <p>We noticed a login attempt from a new device. For your security, please verify this is you.</p>
    
    <div class="otp-box">${otp}</div>
    
    <p style="text-align: center; color: #6b7280; font-size: 14px;">
      This code expires in ${expiresIn}
    </p>
    
    <div class="device-info">
      <p><strong>Device:</strong> ${deviceInfo.browser} on ${deviceInfo.os}</p>
      ${deviceInfo.ip ? `<p><strong>IP Address:</strong> ${deviceInfo.ip}</p>` : ''}
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
    </div>
    
    <div class="warning">
      <strong>Not you?</strong> If you didn't try to log in, someone may have your PIN. 
      <a href="https://vura.app/security" class="button">Secure Account</a>
    </div>
    
    <div class="footer">
      <p>This is an automated security alert from Vura.</p>
      <p>© 2025 Vura. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Build login OTP email HTML template
   */
  private buildLoginOtpEmailTemplate(params: {
    vuraTag: string;
    otp: string;
    deviceInfo: { browser: string; os: string; ip?: string };
    expiresIn: string;
  }): string {
    const { vuraTag, otp, deviceInfo, expiresIn } = params;
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vura Login Verification</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { background: #f9fafb; border-radius: 12px; padding: 32px; }
    .header { text-align: center; margin-bottom: 24px; }
    .logo { font-size: 28px; font-weight: bold; color: #7c3aed; }
    .otp-box { background: #7c3aed; color: white; font-size: 32px; font-weight: bold; text-align: center; padding: 24px; border-radius: 8px; letter-spacing: 8px; margin: 24px 0; }
    .device-info { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .device-info p { margin: 8px 0; font-size: 14px; color: #6b7280; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 16px 0; border-radius: 4px; }
    .footer { text-align: center; font-size: 12px; color: #9ca3af; margin-top: 32px; }
    .button { display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Vura</div>
    </div>
    
    <h2>🔒 Security Verification Required</h2>
    
    <p>Hi @${vuraTag},</p>
    <p>We noticed a login attempt from a new device. For your security, please verify this is you.</p>
    
    <div class="otp-box">${otp}</div>
    
    <p style="text-align: center; color: #6b7280; font-size: 14px;">
      This code expires in ${expiresIn}
    </p>
    
    <div class="device-info">
      <p><strong>Device:</strong> ${deviceInfo.browser} on ${deviceInfo.os}</p>
      ${deviceInfo.ip ? `<p><strong>IP Address:</strong> ${deviceInfo.ip}</p>` : ''}
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
    </div>
    
    <div class="warning">
      <strong>Not you?</strong> If you didn't try to log in, someone may have your PIN. 
      <a href="https://vura.app/security" class="button">Secure Account</a>
    </div>
    
    <div class="footer">
      <p>This is an automated security alert from Vura.</p>
      <p>© 2025 Vura. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Build registration OTP email HTML template
   */
  private buildRegistrationOtpEmailTemplate(params: {
    vuraTag: string;
    otp: string;
    deviceInfo: { browser: string; os: string; ip?: string };
    expiresIn: string;
  }): string {
    const { vuraTag, otp, deviceInfo, expiresIn } = params;
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Vura</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { background: #f9fafb; border-radius: 12px; padding: 32px; }
    .header { text-align: center; margin-bottom: 24px; }
    .logo { font-size: 28px; font-weight: bold; color: #7c3aed; }
    .otp-box { background: #7c3aed; color: white; font-size: 32px; font-weight: bold; text-align: center; padding: 24px; border-radius: 8px; letter-spacing: 8px; margin: 24px 0; }
    .device-info { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .device-info p { margin: 8px 0; font-size: 14px; color: #6b7280; }
    .success-box { background: #dcfce7; border-left: 4px solid #22c55e; padding: 16px; margin: 16px 0; border-radius: 4px; }
    .footer { text-align: center; font-size: 12px; color: #9ca3af; margin-top: 32px; }
    .button { display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Vura</div>
    </div>
    
    <h2>🎉 Welcome to Vura!</h2>
    
    <p>Hi @${vuraTag},</p>
    <p>Thank you for joining Vura! To complete your registration and secure your account, please verify this device.</p>
    
    <div class="otp-box">${otp}</div>
    
    <p style="text-align: center; color: #6b7280; font-size: 14px;">
      This code expires in ${expiresIn}
    </p>
    
    <div class="device-info">
      <p><strong>Device:</strong> ${deviceInfo.browser} on ${deviceInfo.os}</p>
      ${deviceInfo.ip ? `<p><strong>IP Address:</strong> ${deviceInfo.ip}</p>` : ''}
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
    </div>
    
    <div class="success-box">
      <strong>Next Steps:</strong> Enter this code to complete your registration and start using Vura!
    </div>
    
    <div class="footer">
      <p>Welcome to the future of digital banking!</p>
      <p>© 2025 Vura. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Build transaction notification email HTML template
   */
  private buildTransactionEmailTemplate(params: {
    vuraTag: string;
    transaction: {
      type: 'debit' | 'credit';
      amount: number;
      currency: string;
      description: string;
      reference: string;
      counterparty?: string;
      balanceAfter: number;
    };
  }): string {
    const { vuraTag, transaction } = params;
    const isCredit = transaction.type === 'credit';
    const amountSymbol = isCredit ? '+' : '-';
    const amountColor = isCredit ? '#22c55e' : '#ef4444';
    const emoji = isCredit ? '💰' : '💸';
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Transaction Alert</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { background: #f9fafb; border-radius: 12px; padding: 32px; }
    .header { text-align: center; margin-bottom: 24px; }
    .logo { font-size: 28px; font-weight: bold; color: #7c3aed; }
    .amount-box { background: ${amountColor}; color: white; font-size: 32px; font-weight: bold; text-align: center; padding: 24px; border-radius: 8px; margin: 24px 0; }
    .transaction-info { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; }
    .transaction-info p { margin: 8px 0; font-size: 14px; color: #6b7280; }
    .balance-box { background: #e5e7eb; padding: 16px; border-radius: 8px; margin: 16px 0; text-align: center; }
    .footer { text-align: center; font-size: 12px; color: #9ca3af; margin-top: 32px; }
    .button { display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Vura</div>
    </div>
    
    <h2>${emoji} Transaction Alert</h2>
    
    <p>Hi @${vuraTag},</p>
    
    <div class="amount-box" style="background-color: ${amountColor}">
      ${amountSymbol}${transaction.currency}${transaction.amount.toLocaleString()}
    </div>
    
    <div class="transaction-info">
      <p><strong>Description:</strong> ${transaction.description}</p>
      <p><strong>Reference:</strong> ${transaction.reference}</p>
      ${transaction.counterparty ? `<p><strong>Counterparty:</strong> ${transaction.counterparty}</p>` : ''}
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
    </div>
    
    <div class="balance-box">
      <p><strong>Available Balance:</strong></p>
      <p style="font-size: 24px; font-weight: bold; color: #374151;">
        ${transaction.currency}${transaction.balanceAfter.toLocaleString()}
      </p>
    </div>
    
    <div class="footer">
      <p>This is an automated transaction notification from Vura.</p>
      <p>© 2025 Vura. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Build security alert email template
   */
  private buildSecurityAlertTemplate(params: {
    vuraTag: string;
    alertType: string;
    details: Record<string, any>;
  }): string {
    const { vuraTag, alertType, details } = params;
    
    const alertTitles: Record<string, string> = {
      new_device: 'New Device Login Detected',
      suspicious_login: 'Suspicious Login Attempt',
      large_transaction: 'Large Transaction Alert',
    };

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #7c3aed; color: white; padding: 24px; border-radius: 8px; text-align: center; }
    .content { background: #f9fafb; padding: 24px; border-radius: 8px; margin-top: 16px; }
    .alert-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔒 Vura Security Alert</h1>
  </div>
  
  <div class="content">
    <h2>Hi @${vuraTag},</h2>
    <p><strong>${alertTitles[alertType] || 'Security Alert'}</strong></p>
    
    <div class="alert-box">
      <p>We detected activity that may require your attention:</p>
      <pre>${JSON.stringify(details, null, 2)}</pre>
    </div>
    
    <p>If this was you, no action is needed. If not, please secure your account immediately.</p>
    
    <a href="https://vura.app/security" style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Secure My Account</a>
  </div>
</body>
</html>
    `;
  }

  private getAlertSubject(alertType: string): string {
    const subjects: Record<string, string> = {
      new_device: '🔒 New Device Login - Vura',
      suspicious_login: '⚠️ Suspicious Login Attempt - Vura',
      large_transaction: '💰 Large Transaction Alert - Vura',
    };
    return subjects[alertType] || 'Vura Security Alert';
  }
}
