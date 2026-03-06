import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * Result shape compatible with Prembly BVN flow (firstName, lastName, etc.).
 */
export interface KorapayBvnResult {
  success: boolean;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  message?: string;
}

@Injectable()
export class KorapayIdentityService {
  private readonly logger = new Logger(KorapayIdentityService.name);
  private readonly secretKey: string;
  private readonly baseUrl = 'https://api.korapay.com/merchant/api/v1';

  constructor(private config: ConfigService) {
    this.secretKey = this.config.get<string>('KORAPAY_SECRET_KEY') || '';
  }

  isConfigured(): boolean {
    return !!this.secretKey?.trim();
  }

  /**
   * Verify BVN via Korapay Identity API.
   * POST /identities/ng/bvn with id + verification_consent; optional validation (first_name, last_name, date_of_birth).
   */
  async verifyBvn(
    bvn: string,
    options?: { firstName?: string; lastName?: string; dateOfBirth?: string },
  ): Promise<KorapayBvnResult> {
    if (!this.secretKey) {
      return { success: false, message: 'Korapay secret key not configured. Set KORAPAY_SECRET_KEY in environment.' };
    }

    const body: Record<string, unknown> = {
      id: bvn,
      verification_consent: true,
    };

    if (options?.firstName || options?.lastName || options?.dateOfBirth) {
      body.validation = {};
      if (options.firstName) (body.validation as Record<string, string>).first_name = options.firstName;
      if (options.lastName) (body.validation as Record<string, string>).last_name = options.lastName;
      if (options.dateOfBirth) (body.validation as Record<string, string>).date_of_birth = options.dateOfBirth;
    }

    try {
      const res = await axios.post(
        `${this.baseUrl}/identities/ng/bvn`,
        body,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );

      const d = res.data as Record<string, unknown>;
      const status = d?.status === true;
      const msg = (d?.message as string) || '';

      if (!status) {
        const errMsg = (d?.message ?? d?.error ?? 'BVN verification failed') as string;
        this.logger.warn(`Korapay BVN failed: ${errMsg}`);
        return { success: false, message: errMsg };
      }

      const data = d?.data as Record<string, unknown> | undefined;
      if (!data || typeof data !== 'object') {
        return { success: true, message: msg };
      }

      const firstName = (data.first_name ?? data.firstName) as string | undefined;
      const lastName = (data.last_name ?? data.lastName) as string | undefined;
      const middleName = (data.middle_name ?? data.middleName) as string | undefined;
      const phoneNumber = (data.phone_number ?? data.phoneNumber) as string | undefined;
      const dateOfBirth = (data.date_of_birth ?? data.dateOfBirth) as string | undefined;

      return {
        success: true,
        firstName: firstName?.trim(),
        lastName: lastName?.trim(),
        middleName: middleName?.trim(),
        phoneNumber: phoneNumber?.trim(),
        dateOfBirth: dateOfBirth?.trim(),
      };
    } catch (err: any) {
      const status = err.response?.status;
      const data = err.response?.data;
      const msg =
        (data?.message ?? data?.error ?? err.message) as string ?? 'Korapay request failed';
      this.logger.warn(`Korapay BVN error: ${msg}`, { status });

      if (status === 401) {
        return { success: false, message: 'Invalid Korapay secret key. Check KORAPAY_SECRET_KEY.' };
      }
      if (status === 403) {
        return { success: false, message: 'Korapay access denied. Ensure Identity/BVN is enabled on your account.' };
      }
      return { success: false, message: msg };
    }
  }
}
