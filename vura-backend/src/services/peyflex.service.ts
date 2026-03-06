import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class PeyflexService {
  private readonly logger = new Logger(PeyflexService.name);
  private readonly api: AxiosInstance;

  constructor(private config: ConfigService) {
    const token = this.config.get<string>('PEYFLEX_API_TOKEN', '');
    this.api = axios.create({
      baseURL: 'https://client.peyflex.com.ng/api',
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  // ── Airtime ──────────────────────────────────────────────────────────

  async getAirtimeNetworks(): Promise<any[]> {
    try {
      const res = await this.api.get('/airtime/plans/', {
        params: { identifier: 'airtime' },
      });
      return res.data?.data ?? res.data ?? [];
    } catch (err: any) {
      this.logger.error(`getAirtimeNetworks: ${err.message}`);
      return [];
    }
  }

  async buyAirtime(input: {
    network: string;
    phoneNumber: string;
    amount: number;
  }): Promise<{ success: boolean; data?: any; message?: string }> {
    try {
      const res = await this.api.post('/airtime/subscribe/', {
        identifier: 'airtime',
        network: input.network,
        phone: input.phoneNumber,
        amount: String(input.amount),
      });
      const ok =
        res.data?.status === 'success' ||
        res.data?.success === true ||
        res.status === 200;
      return { success: ok, data: res.data, message: res.data?.message };
    } catch (err: any) {
      const msg = err.response?.data?.message ?? err.message;
      this.logger.error(`buyAirtime: ${msg}`);
      return { success: false, message: msg };
    }
  }

  // ── Data ─────────────────────────────────────────────────────────────

  async getDataNetworks(): Promise<any[]> {
    try {
      const res = await this.api.get('/data/plans/', {
        params: { identifier: 'data' },
      });
      return res.data?.data ?? res.data ?? [];
    } catch (err: any) {
      this.logger.error(`getDataNetworks: ${err.message}`);
      return [];
    }
  }

  async getDataPlans(network: string): Promise<any[]> {
    try {
      const res = await this.api.get('/data/plans/', {
        params: { identifier: 'data', network },
      });
      const raw = res.data?.data ?? res.data ?? [];
      return Array.isArray(raw) ? raw : [];
    } catch (err: any) {
      this.logger.error(`getDataPlans: ${err.message}`);
      return [];
    }
  }

  async buyData(input: {
    network: string;
    phoneNumber: string;
    planCode: string;
  }): Promise<{ success: boolean; data?: any; message?: string }> {
    try {
      const res = await this.api.post('/data/subscribe/', {
        identifier: 'data',
        network: input.network,
        phone: input.phoneNumber,
        plan: input.planCode,
      });
      const ok =
        res.data?.status === 'success' ||
        res.data?.success === true ||
        res.status === 200;
      return { success: ok, data: res.data, message: res.data?.message };
    } catch (err: any) {
      const msg = err.response?.data?.message ?? err.message;
      this.logger.error(`buyData: ${msg}`);
      return { success: false, message: msg };
    }
  }

  // ── Electricity ──────────────────────────────────────────────────────

  async getElectricityPlans(): Promise<any[]> {
    try {
      const res = await this.api.get('/electricity/plans/', {
        params: { identifier: 'electricity' },
      });
      return res.data?.data ?? res.data ?? [];
    } catch (err: any) {
      this.logger.error(`getElectricityPlans: ${err.message}`);
      return [];
    }
  }

  async verifyMeter(input: {
    meterNumber: string;
    plan: string;
    type: string;
  }): Promise<{ success: boolean; data?: any; message?: string }> {
    try {
      const res = await this.api.get('/electricity/verify/', {
        params: {
          identifier: 'electricity',
          meter: input.meterNumber,
          plan: input.plan,
          type: input.type,
        },
      });
      const ok =
        res.data?.status === 'success' ||
        res.data?.success === true ||
        !!res.data?.Customer_Name;
      return {
        success: ok,
        data: res.data,
        message: res.data?.message,
      };
    } catch (err: any) {
      const msg = err.response?.data?.message ?? err.message;
      this.logger.error(`verifyMeter: ${msg}`);
      return { success: false, message: msg };
    }
  }

  async buyElectricity(input: {
    meterNumber: string;
    plan: string;
    amount: number;
    type: string;
    phoneNumber: string;
  }): Promise<{ success: boolean; data?: any; message?: string }> {
    try {
      const res = await this.api.post('/electricity/subscribe/', {
        identifier: 'electricity',
        meter: input.meterNumber,
        plan: input.plan,
        amount: String(input.amount),
        type: input.type,
        phone: input.phoneNumber,
      });
      const ok =
        res.data?.status === 'success' ||
        res.data?.success === true ||
        res.status === 200;
      return {
        success: ok,
        data: res.data,
        message: res.data?.message,
      };
    } catch (err: any) {
      const msg = err.response?.data?.message ?? err.message;
      this.logger.error(`buyElectricity: ${msg}`);
      return { success: false, message: msg };
    }
  }
}
