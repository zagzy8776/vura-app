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
  private readonly appId: string;
  private readonly baseUrl = 'https://api.prembly.com';

  constructor(private config: ConfigService) {
    this.apiKey =
      this.config.get<string>('PREMBLY_API_KEY') ||
      this.config.get<string>('PREMBLY_API_TOKEN') ||
      '';
    this.appId = this.config.get<string>('PREMBLY_APP_ID') || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private parseBvnData(data: Record<string, unknown> | null): Omit<PremblyBvnResult, 'success' | 'message'> {
    if (!data || typeof data !== 'object') {
      return {};
    }
    const firstName =
      (data.firstName ?? data.first_name ?? data.firstname) as string | undefined;
    const lastName =
      (data.lastName ?? data.last_name ?? data.lastname) as string | undefined;
    const middleName =
      (data.middleName ?? data.middle_name ?? data.middlename) as string | undefined;
    const phoneNumber =
      (data.phoneNumber ?? data.phone_number ?? data.phone) as string | undefined;
    const dateOfBirth =
      (data.dateOfBirth ?? data.date_of_birth ?? data.dob) as string | undefined;
    return {
      firstName: firstName?.trim() || undefined,
      lastName: lastName?.trim() || undefined,
      middleName: middleName?.trim() || undefined,
      phoneNumber: phoneNumber?.trim() || undefined,
      dateOfBirth: dateOfBirth?.trim() || undefined,
    };
  }

  /**
   * Verify BVN using Prembly.
   * 1) Quick Start: POST /v1/verify with body { type: "bvn", number: "..." }, header x-api-key.
   * 2) If no name data: fallback to BVN Basic POST /verification/bvn_validation (requires app-id + x-api-key).
   */
  async verifyBvn(bvn: string): Promise<PremblyBvnResult> {
    if (!this.apiKey) {
      return { success: false, message: 'Prembly API key not configured. Set PREMBLY_API_KEY in Render environment variables.' };
    }

    let lastError: string | null = null;

    // 1) Quick Start: POST /v1/verify (docs: x-api-key, body type + number)
    try {
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

      const d = v1Res.data as Record<string, unknown>;
      const status = d?.status === true || d?.status === 'success';
      const code = (d?.response_code ?? d?.responseCode ?? '') as string;

      if (!status && code !== '00') {
        const msg = (d?.detail ?? d?.message ?? 'Verification failed') as string;
        this.logger.warn(`Prembly BVN v1/verify failed: ${msg}`);
        return { success: false, message: msg };
      }

      const data = (d?.data ?? d?.verification) as Record<string, unknown> | undefined;
      const parsed = this.parseBvnData(data ?? null);
      if (parsed.firstName || parsed.lastName) {
        return { success: true, ...parsed };
      }
      lastError = 'Prembly did not return name for this BVN.';
    } catch (err: any) {
      const status = err.response?.status;
      const data = err.response?.data;
      const msg =
        (data?.detail ?? data?.message ?? err.message) as string ?? 'Prembly request failed';
      lastError = msg;
      this.logger.warn(`Prembly v1/verify error: ${msg}`, { status });

      if (status === 401) {
        return { success: false, message: 'Invalid Prembly API key. Check PREMBLY_API_KEY in Render.' };
      }
      if (status === 400) {
        return { success: false, message: (data?.detail as string) ?? msg };
      }
      if (status === 403) {
        return { success: false, message: 'Prembly access denied. Ensure your Prembly account has BVN verification enabled.' };
      }
      // Fall through to bvn_validation if we have app-id
    }

    // 2) Fallback: BVN Basic POST /verification/bvn_validation (docs: app-id + x-api-key, body number)
    if (this.appId) {
      try {
        const res = await axios.post(
          `${this.baseUrl}/verification/bvn_validation`,
          { number: bvn },
          {
            headers: {
              'app-id': this.appId,
              'x-api-key': this.apiKey,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          },
        );

        const d = res.data as Record<string, unknown>;
        const status = d?.status === true;
        const code = (d?.response_code ?? '') as string;
        if (!status && code !== '00') {
          const msg = (d?.detail ?? d?.message ?? 'Verification failed') as string;
          return { success: false, message: msg };
        }

        const data = d?.data as Record<string, unknown> | undefined;
        const parsed = this.parseBvnData(data ?? null);
        return { success: true, ...parsed };
      } catch (err: any) {
        const data = err.response?.data;
        const msg =
          (data?.detail ?? data?.message ?? err.message) as string ?? 'BVN validation failed';
        this.logger.warn(`Prembly bvn_validation error: ${msg}`);
        return { success: false, message: msg };
      }
    }

    return {
      success: false,
      message:
        lastError ||
        'Prembly did not return name for this BVN. Enter your first and last name in the form and try again. PREMBLY_APP_ID is optional (only needed for a fallback path if your Prembly plan has it).',
    };
  }
}
