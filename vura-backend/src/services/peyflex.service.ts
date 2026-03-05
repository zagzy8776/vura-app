import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface PeyflexNetwork {
  id: string;
  name: string;
  [key: string]: any;
}

export interface PeyflexDataPlan {
  plan_code: string;
  name: string;
  price: number;
  network: string;
  [key: string]: any;
}

export interface PeyflexTopupResponse {
  success: boolean;
  message?: string;
  data?: any;
  [key: string]: any;
}

@Injectable()
export class PeyflexService {
  private readonly logger = new Logger(PeyflexService.name);
  private readonly client: AxiosInstance;
  private readonly authClient: AxiosInstance;

  private networkCache: Map<string, { data: any; expiresAt: number }> = new Map();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour

  constructor(private config: ConfigService) {
    const baseURL = 'https://client.peyflex.com.ng';
    const token = this.config.get<string>('PEYFLEX_API_TOKEN') || '';

    if (!token) {
      this.logger.warn('PEYFLEX_API_TOKEN not set — bill payments will fail');
    }

    this.client = axios.create({ baseURL, timeout: 15000 });

    this.authClient = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  // ── Airtime ───────────────────────────────────────────────────────────

  async getAirtimeNetworks(): Promise<PeyflexNetwork[]> {
    const cached = this.fromCache('airtime_networks');
    if (cached) return cached;

    try {
      const res = await this.client.get('/api/airtime/networks/');
      const networks = res.data?.data ?? res.data ?? [];
      this.toCache('airtime_networks', networks);
      return networks;
    } catch (err) {
      this.logger.error(`getAirtimeNetworks failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async topupAirtime(
    network: string,
    amount: number,
    mobileNumber: string,
  ): Promise<PeyflexTopupResponse> {
    try {
      const res = await this.authClient.post('/api/airtime/topup/', {
        network,
        amount,
        mobile_number: mobileNumber,
      });

      this.logger.log(
        `Airtime topup: ${amount} to ${mobileNumber} on ${network} — ${res.data?.status ?? 'ok'}`,
      );

      return {
        success: true,
        message: res.data?.message ?? 'Airtime sent successfully',
        data: res.data,
      };
    } catch (err: any) {
      const msg = err.response?.data?.message ?? err.message ?? 'Airtime topup failed';
      this.logger.error(`topupAirtime failed: ${msg}`);
      return { success: false, message: msg, data: err.response?.data };
    }
  }

  // ── Data ──────────────────────────────────────────────────────────────

  async getDataNetworks(): Promise<PeyflexNetwork[]> {
    const cached = this.fromCache('data_networks');
    if (cached) return cached;

    try {
      const res = await this.client.get('/api/data/networks/');
      const networks = res.data?.data ?? res.data ?? [];
      this.toCache('data_networks', networks);
      return networks;
    } catch (err) {
      this.logger.error(`getDataNetworks failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async getDataPlans(networkId: string): Promise<PeyflexDataPlan[]> {
    const cacheKey = `data_plans_${networkId}`;
    const cached = this.fromCache(cacheKey);
    if (cached) return cached;

    try {
      const res = await this.client.get('/api/data/plans/', {
        params: { network: networkId },
      });
      const plans = res.data?.data ?? res.data ?? [];
      this.toCache(cacheKey, plans);
      return plans;
    } catch (err) {
      this.logger.error(`getDataPlans(${networkId}) failed: ${(err as Error).message}`);
      throw err;
    }
  }

  async purchaseData(
    network: string,
    mobileNumber: string,
    planCode: string,
  ): Promise<PeyflexTopupResponse> {
    try {
      const res = await this.authClient.post('/api/data/purchase/', {
        network,
        mobile_number: mobileNumber,
        plan_code: planCode,
      });

      this.logger.log(
        `Data purchase: ${planCode} to ${mobileNumber} on ${network} — ${res.data?.status ?? 'ok'}`,
      );

      return {
        success: true,
        message: res.data?.message ?? 'Data purchased successfully',
        data: res.data,
      };
    } catch (err: any) {
      const msg = err.response?.data?.message ?? err.message ?? 'Data purchase failed';
      this.logger.error(`purchaseData failed: ${msg}`);
      return { success: false, message: msg, data: err.response?.data };
    }
  }

  // ── Cache helpers ─────────────────────────────────────────────────────

  private fromCache(key: string): any | null {
    const entry = this.networkCache.get(key);
    if (entry && entry.expiresAt > Date.now()) return entry.data;
    return null;
  }

  private toCache(key: string, data: any): void {
    this.networkCache.set(key, { data, expiresAt: Date.now() + this.CACHE_TTL });
  }
}
