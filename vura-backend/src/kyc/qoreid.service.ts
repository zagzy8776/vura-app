import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';

export interface QoreIDVerificationResponse {
  success: boolean;
  message?: string;
  data?: {
    id_type: string;
    id_number: string;
    first_name: string;
    last_name: string;
    middle_name?: string;
    date_of_birth?: string;
    phone_number?: string;
    email?: string;
    gender?: string;
    address?: string;
  };
}

export interface QoreIDAMLResponse {
  success: boolean;
  message?: string;
  data?: {
    aml_status: 'clear' | 'flagged' | 'pending';
    pep_status: 'clear' | 'flagged';
    sanction_status: 'clear' | 'flagged';
    adverse_media_status: 'clear' | 'flagged';
    risk_level: 'low' | 'medium' | 'high';
    risk_reasons?: string[];
  };
}

@Injectable()
export class QoreIDService {
  private client: AxiosInstance;
  private readonly logger = new Logger(QoreIDService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;

  constructor() {
    this.clientId = process.env.QOREID_CLIENT_ID || '';
    this.clientSecret = process.env.QOREID_CLIENT_SECRET || '';
    this.baseUrl =
      process.env.QOREID_BASE_URL || 'https://api.qoreid.com/api/v1';

    if (!this.clientId || !this.clientSecret) {
      this.logger.warn(
        'QoreID credentials not configured. KYC verification will fail.',
      );
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });
  }

  /**
   * Generate QoreID authentication header
   */
  private generateAuthHeader(): string {
    const credentials = `${this.clientId}:${this.clientSecret}`;
    return `Bearer ${Buffer.from(credentials).toString('base64')}`;
  }

  /**
   * Verify BVN with QoreID
   * Returns verified user information and AML status
   */
  async verifyBVN(bvn: string): Promise<{
    success: boolean;
    firstName: string;
    lastName: string;
    middleName?: string;
    dateOfBirth?: string;
    phoneNumber?: string;
    email?: string;
    gender?: string;
    amlStatus: 'clear' | 'flagged' | 'pending';
    pepStatus: 'clear' | 'flagged';
    riskLevel: 'low' | 'medium' | 'high';
    riskReasons: string[];
  }> {
    try {
      // Validate BVN format (11 digits)
      if (!/^\d{11}$/.test(bvn)) {
        throw new BadRequestException('Invalid BVN format. Must be 11 digits.');
      }

      this.logger.log(`Verifying BVN: ${bvn.slice(-4)} (last 4 digits)`);

      // Call QoreID BVN verification endpoint
      const verificationResponse =
        await this.client.post<QoreIDVerificationResponse>(
          '/verification/bvn_verification',
          {
            bvn,
            check_aml: true,
          },
          {
            headers: {
              Authorization: this.generateAuthHeader(),
            },
          },
        );

      if (!verificationResponse.data.success) {
        this.logger.warn(
          `BVN verification failed: ${verificationResponse.data.message}`,
        );
        throw new BadRequestException(
          verificationResponse.data.message || 'BVN verification failed',
        );
      }

      const userData = verificationResponse.data.data;

      if (!userData) {
        throw new InternalServerErrorException(
          'No data returned from BVN verification',
        );
      }

      // Get AML screening results
      const amlResponse = await this.getAMLStatus(bvn, 'bvn');

      this.logger.log(
        `BVN verified successfully: ${userData.first_name} ${userData.last_name}`,
      );

      return {
        success: true,
        firstName: userData.first_name,
        lastName: userData.last_name,
        middleName: userData.middle_name,
        dateOfBirth: userData.date_of_birth,
        phoneNumber: userData.phone_number,
        email: userData.email,
        gender: userData.gender,
        amlStatus: amlResponse.data?.aml_status || 'pending',
        pepStatus: amlResponse.data?.pep_status || 'clear',
        riskLevel: amlResponse.data?.risk_level || 'low',
        riskReasons: amlResponse.data?.risk_reasons || [],
      };
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`BVN verification error: ${err.message}`, err.stack);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'BVN verification service temporarily unavailable. Please try again later.',
      );
    }
  }

  /**
   * Verify NIN with QoreID
   * Returns verified user information
   */
  async verifyNIN(nin: string): Promise<{
    success: boolean;
    firstName: string;
    lastName: string;
    middleName?: string;
    dateOfBirth?: string;
    phoneNumber?: string;
    email?: string;
    gender?: string;
    amlStatus: 'clear' | 'flagged' | 'pending';
    pepStatus: 'clear' | 'flagged';
    riskLevel: 'low' | 'medium' | 'high';
    riskReasons: string[];
  }> {
    try {
      // Validate NIN format (11 digits)
      if (!/^\d{11}$/.test(nin)) {
        throw new BadRequestException('Invalid NIN format. Must be 11 digits.');
      }

      this.logger.log(`Verifying NIN: ${nin.slice(-4)} (last 4 digits)`);

      // Call QoreID NIN verification endpoint
      const verificationResponse =
        await this.client.post<QoreIDVerificationResponse>(
          '/verification/nin_verification',
          {
            nin,
            check_aml: true,
          },
          {
            headers: {
              Authorization: this.generateAuthHeader(),
            },
          },
        );

      if (!verificationResponse.data.success) {
        this.logger.warn(
          `NIN verification failed: ${verificationResponse.data.message}`,
        );
        throw new BadRequestException(
          verificationResponse.data.message || 'NIN verification failed',
        );
      }

      const userData = verificationResponse.data.data;

      if (!userData) {
        throw new InternalServerErrorException(
          'No data returned from NIN verification',
        );
      }

      // Get AML screening results
      const amlResponse = await this.getAMLStatus(nin, 'nin');

      this.logger.log(
        `NIN verified successfully: ${userData.first_name} ${userData.last_name}`,
      );

      return {
        success: true,
        firstName: userData.first_name,
        lastName: userData.last_name,
        middleName: userData.middle_name,
        dateOfBirth: userData.date_of_birth,
        phoneNumber: userData.phone_number,
        email: userData.email,
        gender: userData.gender,
        amlStatus: amlResponse.data?.aml_status || 'pending',
        pepStatus: amlResponse.data?.pep_status || 'clear',
        riskLevel: amlResponse.data?.risk_level || 'low',
        riskReasons: amlResponse.data?.risk_reasons || [],
      };
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`NIN verification error: ${err.message}`, err.stack);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'NIN verification service temporarily unavailable. Please try again later.',
      );
    }
  }

  /**
   * Get AML screening status for an ID
   */
  private async getAMLStatus(
    idNumber: string,
    idType: 'bvn' | 'nin',
  ): Promise<QoreIDAMLResponse> {
    try {
      const response = await this.client.post<QoreIDAMLResponse>(
        '/verification/aml_check',
        {
          [idType]: idNumber,
        },
        {
          headers: {
            Authorization: this.generateAuthHeader(),
          },
        },
      );

      return response.data;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.warn(`AML check failed for ${idType}: ${err.message}`);
      // Return default safe response if AML check fails
      return {
        success: false,
        message: 'AML check unavailable',
        data: {
          aml_status: 'pending',
          pep_status: 'clear',
          sanction_status: 'clear',
          adverse_media_status: 'clear',
          risk_level: 'low',
          risk_reasons: [],
        },
      };
    }
  }

  /**
   * Hash ID number for storage (SHA-256)
   */
  hashIDNumber(idNumber: string): string {
    return crypto.createHash('sha256').update(idNumber).digest('hex');
  }

  /**
   * Determine user risk level based on AML response
   */
  determineRiskLevel(
    amlResponse: QoreIDAMLResponse['data'],
  ): 'low' | 'medium' | 'high' {
    if (!amlResponse) {
      return 'low';
    }

    // High risk if flagged in any screening
    if (
      amlResponse.aml_status === 'flagged' ||
      amlResponse.pep_status === 'flagged' ||
      amlResponse.sanction_status === 'flagged' ||
      amlResponse.adverse_media_status === 'flagged'
    ) {
      return 'high';
    }

    // Medium risk if pending
    if (
      amlResponse.aml_status === 'pending' ||
      amlResponse.risk_level === 'medium'
    ) {
      return 'medium';
    }

    // Default to low
    return 'low';
  }

  /**
   * Check if ID verification should trigger additional review
   */
  requiresManualReview(amlResponse: QoreIDAMLResponse['data']): boolean {
    if (!amlResponse) {
      return false;
    }

    // Require manual review for flagged or high-risk
    return (
      amlResponse.aml_status === 'flagged' ||
      amlResponse.pep_status === 'flagged' ||
      amlResponse.sanction_status === 'flagged' ||
      amlResponse.adverse_media_status === 'flagged' ||
      amlResponse.risk_level === 'high'
    );
  }

  /**
   * Test connection to QoreID
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.get('/health', {
        headers: {
          Authorization: this.generateAuthHeader(),
        },
      });
      return true;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`QoreID connection test failed: ${err.message}`);
      return false;
    }
  }
}
