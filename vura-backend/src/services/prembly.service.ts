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
   * 1) Tries BVN Basic POST /verification/bvn_validation (works with app-id + x-api-key; may work with x-api-key only on some plans).
   * 2) Fallback: POST /v1/verify with x-api-key only (no app-id).
   * If you don't have PREMBLY_APP_ID: get it from Prembly dashboard → Integrations → API Library → Applications → copy App ID.
   */
  async verifyBvn(bvn: string): Promise<PremblyBvnResult> {
    if (!this.apiKey) {
      return { success: false, message: 'Prembly API key not configured. Set PREMBLY_API_KEY in your backend environment.' };
    }

    let lastError: string | null = null;

    // 1) BVN Basic: try /verification/bvn_validation (with app-id if set; some plans may accept x-api-key only)
    const bvnValidationPaths = [
      `${this.baseUrl}/verification/bvn_validation`,
      `${this.baseUrl}/identitypass/verification/bvn_validation`,
    ] as const;

    for (const url of bvnValidationPaths) {
      try {
        const headers: Record<string, string> = {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        };
        if (this.appId) headers['app-id'] = this.appId;

        const res = await axios.post(
          url,
          { number: bvn },
          { headers, timeout: 15000 },
        );

        const d = res.data as Record<string, unknown>;
        const status = d?.status === true;
        const code = (d?.response_code ?? d?.responseCode ?? '') as string;
        if (!status && code !== '00') {
          const msg = (d?.detail ?? d?.message ?? 'Verification failed') as string;
          lastError = msg;
          continue;
        }

        // Docs use both "data" and "bvn_data"
        const data = (d?.data ?? d?.bvn_data ?? d?.verification) as Record<string, unknown> | undefined;
        const parsed = this.parseBvnData(data ?? null);
        if (parsed.firstName || parsed.lastName) {
          return { success: true, ...parsed };
        }
        lastError = 'Prembly did not return name for this BVN.';
        break; // same path won't change
      } catch (err: any) {
        const status = err.response?.status;
        const data = err.response?.data;
        const msg = (data?.detail ?? data?.message ?? err.message) as string ?? 'BVN validation failed';
        lastError = msg;
        this.logger.warn(`Prembly bvn_validation ${url}: ${msg}`, { status });
        if (status === 404) continue; // try next path
        if (status === 401) {
          return { success: false, message: 'Invalid Prembly API key. Check PREMBLY_API_KEY.' };
        }
        if (status === 400 || status === 403) {
          // Might be "app-id required" – fall through to try /v1/verify
          break;
        }
      }
    }

    // 2) Fallback: POST /v1/verify with x-api-key only (no app-id)
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

      const data = (d?.data ?? d?.bvn_data ?? d?.verification) as Record<string, unknown> | undefined;
      const parsed = this.parseBvnData(data ?? null);
      if (parsed.firstName || parsed.lastName) {
        return { success: true, ...parsed };
      }
      lastError = lastError || 'Prembly did not return name for this BVN.';
    } catch (err: any) {
      const status = err.response?.status;
      const data = err.response?.data;
      const msg =
        (data?.detail ?? data?.message ?? err.message) as string ?? 'Prembly request failed';
      lastError = lastError || msg;
      this.logger.warn(`Prembly v1/verify error: ${msg}`, { status });

      if (status === 401) {
        return { success: false, message: 'Invalid Prembly API key. Check PREMBLY_API_KEY.' };
      }
      if (status === 400) {
        return { success: false, message: (data?.detail as string) ?? msg };
      }
      if (status === 403) {
        return { success: false, message: 'Prembly access denied. Ensure your account has BVN verification enabled.' };
      }
    }

    const needAppId = !this.appId;

    return {
      success: false,
      message: needAppId
        ? 'BVN verification with Prembly requires an App ID. Get it from your Prembly dashboard: go to Integrations → API Library → Applications, copy the App ID, then set PREMBLY_APP_ID in your backend environment (e.g. Render).'
        : (lastError || 'Prembly BVN verification failed. Enter your first and last name in the form and try again.'),
    };
  }
}
