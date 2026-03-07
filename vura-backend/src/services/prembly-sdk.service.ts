import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const PREMBLY_SDK_INITIATE_URL =
  'https://backend.prembly.com/api/v1/checker-widget/sdk/sessions/initiate/';

/** Base URL for Prembly verification widget (from their SDK guide). */
const PREMBLY_VERIFICATION_BASE_URL =
  'https://dv7wajvnnyl16.cloudfront.net';

export interface PremblySdkInitiateResult {
  success: boolean;
  sessionId?: string;
  verificationUrl?: string;
  message?: string;
}

@Injectable()
export class PremblySdkService {
  private readonly logger = new Logger(PremblySdkService.name);
  private readonly widgetId: string;
  private readonly widgetKey: string;

  constructor(private config: ConfigService) {
    this.widgetId = this.config.get<string>('PREMBLY_WIDGET_ID') || '';
    this.widgetKey = this.config.get<string>('PREMBLY_WIDGET_KEY') || '';
  }

  isConfigured(): boolean {
    return !!(this.widgetId && this.widgetKey);
  }

  /**
   * Initiate a Prembly SDK verification session.
   * Returns session_id and verification URL to open in popup/redirect.
   */
  async initiateSession(params: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  }): Promise<PremblySdkInitiateResult> {
    if (!this.widgetId || !this.widgetKey) {
      return {
        success: false,
        message:
          'Prembly SDK not configured. Set PREMBLY_WIDGET_ID and PREMBLY_WIDGET_KEY in your backend environment.',
      };
    }

    try {
      const response = await axios.post(
        PREMBLY_SDK_INITIATE_URL,
        {
          first_name: params.firstName,
          last_name: params.lastName,
          email: params.email,
          ...(params.phone ? { phone: params.phone } : {}),
          widget_id: this.widgetId,
          widget_key: this.widgetKey,
        },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );

      const data = response.data as {
        status?: boolean;
        message?: string;
        data?: {
          session?: {
            id?: string;
            session_id?: string;
            status?: string;
            full_name?: string;
            end_user_email?: string;
            end_user_phone?: string;
          };
        };
      };

      if (!data?.status || !data?.data?.session) {
        return {
          success: false,
          message: (data?.message as string) || 'Failed to start verification session.',
        };
      }

      const session = data.data.session;
      const sessionId =
        (session.session_id as string) || (session.id as string);
      if (!sessionId) {
        return {
          success: false,
          message: 'Prembly did not return a session ID.',
        };
      }

      const verificationUrl = `${PREMBLY_VERIFICATION_BASE_URL}/?session=${sessionId}`;
      this.logger.log(`Prembly SDK session initiated: ${sessionId}`);

      return {
        success: true,
        sessionId,
        verificationUrl,
      };
    } catch (err: any) {
      const status = err.response?.status;
      const body = err.response?.data;
      const msg =
        (body?.message ?? body?.detail ?? err.message) as string ||
        'Failed to initiate Prembly verification.';
      this.logger.warn(`Prembly SDK initiate error: ${msg}`, { status });
      return {
        success: false,
        message: msg,
      };
    }
  }
}
