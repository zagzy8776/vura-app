import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface PremblyBvnResult {
  success: boolean;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  message?: string;
}

@Injectable()
export class PremblyService {
  private readonly logger = new Logger(PremblyService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.prembly.com';

  constructor(private config: ConfigService) {
    this.apiKey = this.config.get<string>('PREMBLY_API_KEY') || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Verify BVN using Prembly Quick Start endpoint.
   * POST /v1/verify with body { type: "bvn", number: "..." }
   * Falls back to /verification/bvn_validation if v1 returns no name data.
   */
  async verifyBvn(bvn: string): Promise<PremblyBvnResult> {
    if (!this.apiKey) {
      return { success: false, message: 'Prembly API key not configured' };
    }

    try {
      // Quick Start: POST /v1/verify
      const v1Res = await axios.post(
        `${this.baseUrl}/v1/verify`,
        { type: 'bvn', number: bvn },
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );

      const d = v1Res.data;
      const status = d?.status === true || d?.status === 'success';
      const code = d?.response_code ?? d?.responseCode ?? '';

      if (!status && code !== '00') {
        const msg = d?.detail ?? d?.message ?? 'Verification failed';
        this.logger.warn(`Prembly BVN verify failed: ${msg}`);
        return { success: false, message: msg };
      }

      // Extract name from various possible response shapes
      const data = d?.data ?? d?.verification ?? {};
      const firstName =
        data?.firstName ?? data?.first_name ?? data?.firstname ?? '';
      const lastName =
        data?.lastName ?? data?.last_name ?? data?.lastname ?? '';
      const middleName =
        data?.middleName ?? data?.middle_name ?? data?.middlename;

      return {
        success: true,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        middleName: middleName || undefined,
        phoneNumber: data?.phoneNumber ?? data?.phone_number ?? data?.phone,
        dateOfBirth: data?.dateOfBirth ?? data?.date_of_birth ?? data?.dob,
      };
    } catch (err: any) {
      const status = err.response?.status;
      const data = err.response?.data;
      const msg =
        data?.detail ?? data?.message ?? err.message ?? 'Prembly request failed';
      this.logger.error(`Prembly BVN verify error: ${msg}`, { status, data });

      if (status === 401) {
        return { success: false, message: 'Invalid API key' };
      }
      if (status === 400) {
        return { success: false, message: data?.detail ?? msg };
      }

      return { success: false, message: msg };
    }
  }
}
