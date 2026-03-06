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

  private static readonly DATA_NETWORK_IDS: Record<string, string> = {
    mtn: 'MTN',
    glo: 'GLO',
    airtel: 'Airtel',
    '9mobile': '9mobile',
    BIL108: 'MTN',
    BIL109: 'GLO',
    BIL110: 'Airtel',
    BIL111: '9mobile',
  };

  /** Normalize network id for comparison (e.g. MTN -> mtn). */
  private static normalizeNetworkId(id: string): string {
    const s = (id || '').trim().toLowerCase();
    if (s === '9mobile' || s === '9mobile') return '9mobile';
    return s;
  }

  /** Extract plan_code, name, price from various API shapes. */
  private static normalizePlan(item: any): { plan_code: string; name: string; price: number } {
    const plan_code =
      item?.plan_code ?? item?.code ?? item?.id ?? item?.bundle_code ?? String(item?.name ?? '');
    const name =
      item?.name ?? item?.plan_name ?? item?.description ?? item?.bundle_name ?? item?.product_name ?? String(plan_code);
    const price = Number(
      item?.price ?? item?.amount ?? item?.selling_price ?? item?.cost ?? 0,
    );
    return { plan_code: String(plan_code), name: String(name), price };
  }

  async getDataNetworks(): Promise<any[]> {
    try {
      const res = await this.api.get('/data/plans/', {
        params: { identifier: 'data' },
      });
      const raw = res.data?.data ?? res.data ?? [];
      const arr = Array.isArray(raw) ? raw : [];

      // If API returned a list of plans (each with network/biller), derive unique networks.
      const seen = new Set<string>();
      const networks: { id: string; name: string }[] = [];
      for (const item of arr) {
        const netId =
          item?.network ?? item?.biller_code ?? item?.biller ?? item?.provider_id ?? item?.provider ?? '';
        const n = PeyflexService.normalizeNetworkId(netId);
        if (n && !seen.has(n)) {
          seen.add(n);
          const name =
            PeyflexService.DATA_NETWORK_IDS[item?.network ?? netId] ??
            PeyflexService.DATA_NETWORK_IDS[n] ??
            (item?.network_name ?? (netId ? String(netId).toUpperCase() : ''));
          networks.push({ id: netId || n, name: name || n });
        }
      }
      if (networks.length > 0) return networks;

      // If array looks like list of networks (id/name or identifier/name).
      for (const item of arr) {
        const id = item?.id ?? item?.identifier ?? item?.biller_code ?? '';
        if (id && !seen.has(PeyflexService.normalizeNetworkId(id))) {
          seen.add(PeyflexService.normalizeNetworkId(id));
          networks.push({
            id: String(id),
            name: item?.name ?? item?.network_name ?? String(id).toUpperCase(),
          });
        }
      }
      if (networks.length > 0) return networks;

      return [];
    } catch (err: any) {
      this.logger.error(`getDataNetworks: ${err.message}`);
      return [];
    }
  }

  async getDataPlans(network: string): Promise<any[]> {
    const normalizedNet = PeyflexService.normalizeNetworkId(network);
    try {
      // Try with 'network' param (common)
      let res = await this.api.get('/data/plans/', {
        params: { identifier: 'data', network: network.trim() },
      });
      let raw = res.data?.data ?? res.data ?? [];
      let arr = Array.isArray(raw) ? raw : [];

      // If empty, try with 'biller' or fetch all and filter
      if (arr.length === 0) {
        try {
          res = await this.api.get('/data/plans/', {
            params: { identifier: 'data', biller: network.trim() },
          });
          raw = res.data?.data ?? res.data ?? [];
          arr = Array.isArray(raw) ? raw : [];
        } catch {
          // ignore
        }
      }

      if (arr.length === 0) {
        // Fetch all plans and filter by network
        res = await this.api.get('/data/plans/', { params: { identifier: 'data' } });
        raw = res.data?.data ?? res.data ?? [];
        const all = Array.isArray(raw) ? raw : [];
        arr = all.filter(
          (p: any) =>
            normalizedNet === PeyflexService.normalizeNetworkId(p?.network ?? p?.biller_code ?? p?.biller ?? ''),
        );
      }

      return arr.map((item: any) => PeyflexService.normalizePlan(item));
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
