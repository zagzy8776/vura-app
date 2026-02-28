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
   * Send OTP email for new device verification
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
      const subject = 'Your Vura Login Code';
      const html = this.buildOtpEmailTemplate({
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

      this.logger.log(`OTP email sent to ${email} for user ${userId}`);
      return true;
    } catch (error) {
      this.logger.error('Error sending OTP email:', error);
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
      this.logger.warn('Email service not configured - skipping security alert');
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
