import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const BASE_URL = 'https://www.nellobytesystems.com';

/** Map network name or id to Nellobyte code: 01=MTN, 02=GLO, 03=9mobile, 04=Airtel */
function toNellobyteNetwork(network: string): string {
  const n = (network || '').trim().toLowerCase();
  const map: Record<string, string> = {
    mtn: '01',
    glo: '02',
    '9mobile': '03',
    airtel: '04',
    bil108: '01',
    bil109: '02',
    bil111: '03',
    bil110: '04',
  };
  return map[n] ?? (n.length <= 2 ? n : '01');
}

@Injectable()
export class NellobyteService {
  private readonly logger = new Logger(NellobyteService.name);
  private readonly userId: string;
  private readonly apiKey: string;
  private readonly enabled: boolean;

  constructor(private config: ConfigService) {
    this.userId = this.config.get<string>('NELLOBYTE_USERID', '');
    this.apiKey = this.config.get<string>('NELLOBYTE_API_KEY', '');
    this.enabled = !!(this.userId && this.apiKey);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private async get<T = any>(path: string, params: Record<string, string>): Promise<T> {
    const url = `${BASE_URL}/${path}`;
    const q = new URLSearchParams({
      UserID: this.userId,
      APIKey: this.apiKey,
      ...params,
    });
    const res = await axios.get(`${url}?${q.toString()}`, { timeout: 30000 });
    return res.data as T;
  }

  private async queryOrder(orderId: string): Promise<{ statuscode?: string; status?: string }> {
    try {
      const data = await this.get<any>('APIQueryV1.asp', { OrderID: orderId });
      return {
        statuscode: String(data?.statuscode ?? data?.status ?? ''),
        status: String(data?.status ?? data?.orderstatus ?? ''),
      };
    } catch (e: any) {
      this.logger.warn(`queryOrder ${orderId}: ${e.message}`);
      return {};
    }
  }

  /** Poll for ORDER_COMPLETED (statuscode 200) up to maxAttempts */
  private async waitForCompletion(
    orderId: string,
    maxAttempts = 6,
    intervalMs = 3000,
  ): Promise<{ success: boolean; message?: string }> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      const q = await this.queryOrder(orderId);
      const code = q.statuscode ?? '';
      if (code === '200') return { success: true };
      if (code !== '100' && code !== '') {
        return { success: false, message: q.status || `Status ${code}` };
      }
    }
    return { success: false, message: 'Purchase is taking longer than expected. You have been refunded.' };
  }

  // ── Airtime ───────────────────────────────────────────────────────────

  async getAirtimeNetworks(): Promise<{ id: string; name: string }[]> {
    if (!this.enabled) return [];
    return [
      { id: '01', name: 'MTN' },
      { id: '02', name: 'GLO' },
      { id: '04', name: 'Airtel' },
      { id: '03', name: '9mobile' },
    ];
  }

  async buyAirtime(input: {
    network: string;
    phoneNumber: string;
    amount: number;
  }): Promise<{ success: boolean; data?: any; message?: string }> {
    if (!this.enabled) return { success: false, message: 'Nellobyte not configured' };
    try {
      const networkCode = toNellobyteNetwork(input.network);
      const requestId = `AIRTIME-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const data = await this.get<any>('APIAirtimeV1.asp', {
        MobileNetwork: networkCode,
        Amount: String(input.amount),
        MobileNumber: input.phoneNumber,
        RequestID: requestId,
      });

      const orderId = data?.orderid;
      const statusCode = String(data?.statuscode ?? '');

      if (!orderId || statusCode !== '100') {
        const msg = data?.status ?? data?.description ?? 'Order not received';
        return { success: false, message: msg };
      }

      const poll = await this.waitForCompletion(orderId);
      if (!poll.success) {
        return { success: false, message: poll.message };
      }

      return { success: true, data: { orderid: orderId, ...data } };
    } catch (e: any) {
      const msg = e.response?.data?.message ?? e.message ?? 'Airtime purchase failed';
      this.logger.error(`buyAirtime: ${msg}`);
      return { success: false, message: msg };
    }
  }

  // ── Data ──────────────────────────────────────────────────────────────

  async getDataNetworks(): Promise<{ id: string; name: string }[]> {
    if (!this.enabled) return [];
    return [
      { id: '01', name: 'MTN' },
      { id: '02', name: 'GLO' },
      { id: '04', name: 'Airtel' },
      { id: '03', name: '9mobile' },
    ];
  }

  async getDataPlans(network: string): Promise<{ plan_code: string; name: string; price: number }[]> {
    if (!this.enabled) return this.getStaticDataPlans(toNellobyteNetwork(network));
    const networkCode = toNellobyteNetwork(network);
    try {
      const data = await this.get<any>('APIDatabundlePlansV2.asp', {});
      if (!data || typeof data !== 'object') return this.getStaticDataPlans(networkCode);

      const plans: { plan_code: string; name: string; price: number }[] = [];
      const seen = new Set<string>();

      const pushPlan = (item: any) => {
        if (!item || typeof item !== 'object') return;
        const code = item?.code ?? item?.id ?? item?.plan_code ?? item?.DataPlan ?? item?.Plan ?? '';
        const name = typeof item?.name === 'string' ? item.name : (typeof item?.description === 'string' ? item.description : (typeof item?.Product === 'string' ? item.Product : String(code)));
        const price = Number(item?.price ?? item?.amount ?? item?.Amount ?? 0);
        if (!code || !name || String(name).includes('[object')) return;
        const key = `${String(code)}-${price}`;
        if (seen.has(key)) return;
        seen.add(key);
        plans.push({ plan_code: String(code), name: String(name), price });
      };

      const isForNetwork = (key: string): boolean => {
        const k = String(key).toLowerCase().trim();
        if (k === networkCode || k === networkCode.padStart(2, '0')) return true;
        if (networkCode === '01' && (k.includes('mtn') || k === '1')) return true;
        if (networkCode === '02' && (k.includes('glo') || k === '2')) return true;
        if (networkCode === '04' && (k.includes('airtel') || k === '4')) return true;
        if (networkCode === '03' && (k.includes('9mobile') || k.includes('etisalat') || k === '3')) return true;
        return false;
      };

      const collectFrom = (raw: any) => {
        if (Array.isArray(raw)) for (const item of raw) pushPlan(item);
        else if (raw && typeof raw === 'object') for (const item of Object.values(raw)) pushPlan(item);
      };

      if (Array.isArray(data)) {
        for (const item of data) {
          const net = item?.network ?? item?.Network ?? item?.mobileNetwork ?? item?.MobileNetwork ?? item?.biller_id ?? '';
          if (isForNetwork(String(net))) pushPlan(item);
        }
        if (plans.length > 0) return this.sortPlans(plans);
        for (const item of data) pushPlan(item);
      } else {
        for (const [key, items] of Object.entries(data)) {
          if (isForNetwork(key)) {
            const arr = Array.isArray(items) ? items : (items && typeof items === 'object' ? Object.values(items) : []);
            for (const item of arr) pushPlan(item);
          }
        }
        if (plans.length > 0) return this.sortPlans(plans);
        for (const [, items] of Object.entries(data)) {
          const arr = Array.isArray(items) ? items : (items && typeof items === 'object' ? Object.values(items) : []);
          for (const item of arr) pushPlan(item);
        }
        const wrapKeys = ['data', 'plans', 'Plans', 'databundle', 'Databundle', 'result', 'Result'];
        for (const w of wrapKeys) {
          if (data[w] != null) collectFrom(data[w]);
          if (plans.length > 0) return this.sortPlans(plans);
        }
      }

      if (plans.length > 0) return this.sortPlans(plans);
    } catch (e: any) {
      this.logger.warn(`getDataPlans: ${e.message}`);
    }
    return this.getStaticDataPlans(networkCode);
  }

  private sortPlans(plans: { plan_code: string; name: string; price: number }[]): { plan_code: string; name: string; price: number }[] {
    return [...plans].sort((a, b) => a.price - b.price);
  }

  private getStaticDataPlans(networkCode: string): { plan_code: string; name: string; price: number }[] {
    const generic = [
      { plan_code: '50', name: '50 MB - 30 days', price: 7 },
      { plan_code: '100', name: '100 MB - 30 days', price: 14 },
      { plan_code: '300', name: '300 MB - 30 days', price: 42 },
      { plan_code: '500', name: '500 MB - 30 days', price: 75 },
      { plan_code: '1000', name: '1 GB - 30 days', price: 135 },
      { plan_code: '2000', name: '2 GB - 30 days', price: 270 },
      { plan_code: '5000', name: '5 GB - 30 days', price: 675 },
      { plan_code: '10000', name: '10 GB - 30 days', price: 1350 },
    ];
    const byNetwork: Record<string, { plan_code: string; name: string; price: number }[]> = {
      '01': [
        ...generic,
        { plan_code: '500', name: '500MB - 7 days (SME)', price: 404 },
        { plan_code: '1000', name: '1GB - 7 days (SME)', price: 567 },
        { plan_code: '2000', name: '2GB - 7 days (SME)', price: 1134 },
        { plan_code: '5000', name: '5GB - 7 days (SME)', price: 2540 },
        { plan_code: '1000.01', name: '1.5GB Daily', price: 500 },
        { plan_code: '1500.01', name: '2GB+2mins Monthly', price: 1500 },
        { plan_code: '2500.01', name: '6GB Weekly', price: 2500 },
        { plan_code: '3500.02', name: '7GB Monthly', price: 3500 },
        { plan_code: 'awuf500', name: 'MTN Awuf 500MB', price: 200 },
        { plan_code: 'awuf1', name: 'MTN Awuf 1GB', price: 300 },
      ],
      '02': [
        ...generic,
        { plan_code: '920', name: 'GLO Yakata 920MB - 30 days', price: 400 },
        { plan_code: '1800', name: 'GLO Yakata 1.8GB - 30 days', price: 800 },
        { plan_code: '5000glo', name: 'GLO Yakata 5GB - 30 days', price: 1600 },
        { plan_code: '500', name: '500MB - 7 days (SME)', price: 235 },
        { plan_code: '1000', name: '1GB - 30 days (SME)', price: 470 },
        { plan_code: '2000', name: '2GB - 30 days (SME)', price: 940 },
        { plan_code: '5000', name: '5GB - 30 days (SME)', price: 2350 },
        { plan_code: '500.01', name: '1.5GB - 14 days', price: 500 },
        { plan_code: '1000.01', name: '2.6GB - 30 days', price: 1000 },
      ],
      '04': [
        ...generic,
        { plan_code: '499.91', name: '1GB - 1 day', price: 499.91 },
        { plan_code: '999.91', name: '3GB - 2 days', price: 999.91 },
        { plan_code: '799.91', name: '1GB - 7 days', price: 799.91 },
        { plan_code: '1499.93', name: '2GB - 30 days', price: 1499.93 },
        { plan_code: '2499.92', name: '4GB - 30 days', price: 2499.92 },
      ],
      '03': [
        ...generic,
        { plan_code: '500', name: '500MB - 30 days (SME)', price: 225 },
        { plan_code: '1000', name: '1GB - 30 days (SME)', price: 450 },
        { plan_code: '2000', name: '2GB - 30 days (SME)', price: 900 },
        { plan_code: '500.01', name: '650MB - 3 days', price: 500 },
        { plan_code: '1000.01', name: '1.1GB - 30 days', price: 1000 },
      ],
    };
    const list = byNetwork[networkCode] ?? generic;
    const dedup = new Map<string, { plan_code: string; name: string; price: number }>();
    for (const p of list) {
      const k = `${p.plan_code}-${p.name}-${p.price}`;
      if (!dedup.has(k)) dedup.set(k, p);
    }
    return Array.from(dedup.values()).sort((a, b) => a.price - b.price);
  }

  async buyData(input: {
    network: string;
    phoneNumber: string;
    planCode: string;
  }): Promise<{ success: boolean; data?: any; message?: string }> {
    if (!this.enabled) return { success: false, message: 'Nellobyte not configured' };
    try {
      const networkCode = toNellobyteNetwork(input.network);
      const requestId = `DATA-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const data = await this.get<any>('APIDatabundleV1.asp', {
        MobileNetwork: networkCode,
        DataPlan: input.planCode,
        MobileNumber: input.phoneNumber,
        RequestID: requestId,
      });

      const orderId = data?.orderid;
      const statusCode = String(data?.statuscode ?? '');

      if (!orderId || statusCode !== '100') {
        const msg = data?.status ?? data?.description ?? 'Order not received';
        return { success: false, message: msg };
      }

      const poll = await this.waitForCompletion(orderId);
      if (!poll.success) {
        return { success: false, message: poll.message };
      }

      return { success: true, data: { orderid: orderId, ...data } };
    } catch (e: any) {
      const msg = e.response?.data?.message ?? e.message ?? 'Data purchase failed';
      this.logger.error(`buyData: ${msg}`);
      return { success: false, message: msg };
    }
  }

  // ── Electricity ────────────────────────────────────────────────────────

  /** Nellobyte disco codes: 01=EKEDC, 02=IKEDC, etc. */
  private static readonly DISCO_TO_CODE: Record<string, string> = {
    'eko-electric': '01',
    ekedc: '01',
    'ikeja-electric': '02',
    ikedc: '02',
    'ibadan-electric': '03',
    ibedc: '03',
    'enugu-electric': '04',
    eedc: '04',
    'portharcourt-electric': '05',
    phed: '05',
    'benin-electric': '06',
    bedc: '06',
    'kaduna-electric': '07',
    kedc: '07',
    'kano-electric': '08',
    kedco: '08',
    'abuja-electric': '09',
    aedc: '09',
  };

  private toDiscoCode(disco: string): string {
    const raw = (disco || '').trim();
    if (/^\d{1,2}$/.test(raw)) return raw.padStart(2, '0').slice(0, 2);
    const n = raw.toLowerCase().replace(/[- ]/g, '-');
    return NellobyteService.DISCO_TO_CODE[n] ?? '01';
  }

  async getElectricityDiscos(): Promise<{ id: string; name: string }[]> {
    if (!this.enabled) return this.getStaticElectricityDiscos();
    try {
      const data = await this.get<any>('APIElectricityDiscosV2.asp', {});
      if (data && typeof data === 'object') {
        const arr: { id: string; name: string }[] = [];
        if (Array.isArray(data)) {
          for (const item of data) {
            const id = item?.id ?? item?.code ?? item?.biller_id ?? item?.disco_code ?? '';
            const name = typeof item?.name === 'string' ? item.name : (typeof item?.description === 'string' ? item.description : (typeof item?.biller_name === 'string' ? item.biller_name : ''));
            if (id && name && !String(name).includes('[object')) arr.push({ id: String(id), name: String(name) });
          }
        } else {
          for (const [code, val] of Object.entries(data)) {
            const name = typeof val === 'string' ? val : (val && typeof val === 'object' ? (val as any).name ?? (val as any).description ?? (val as any).biller_name ?? '' : String(val));
            if (code && name && !String(name).includes('[object')) arr.push({ id: String(code), name: String(name) });
          }
        }
        if (arr.length > 0) return arr;
      }
    } catch {
      /* fallback */
    }
    return this.getStaticElectricityDiscos();
  }

  private getStaticElectricityDiscos(): { id: string; name: string }[] {
    return [
      { id: '01', name: 'Eko Electric (EKEDC)' },
      { id: '02', name: 'Ikeja Electric (IKEDC)' },
      { id: '03', name: 'Ibadan Electric (IBEDC)' },
      { id: '04', name: 'Enugu Electric (EEDC)' },
      { id: '05', name: 'Port Harcourt (PHED)' },
      { id: '06', name: 'Benin Electric (BEDC)' },
      { id: '07', name: 'Kaduna Electric (KEDC)' },
      { id: '08', name: 'Kano Electric (KEDCO)' },
      { id: '09', name: 'Abuja Electric (AEDC)' },
    ];
  }

  async verifyMeter(input: {
    meterNumber: string;
    plan: string;
    type: string;
  }): Promise<{ success: boolean; data?: any; message?: string }> {
    if (!this.enabled) return { success: false, message: 'Nellobyte not configured' };
    try {
      const discoCode = this.toDiscoCode(input.plan);
      const meterType = input.type?.toLowerCase().includes('prepaid') ? '01' : '02';
      const data = await this.get<any>('APIVerifyElectricityV1.asp', {
        ElectricCompany: discoCode,
        MeterNo: input.meterNumber,
        MeterType: meterType,
      });
      const name = data?.customer_name ?? '';
      const valid = name && !name.toUpperCase().includes('INVALID');
      return { success: valid, data, message: valid ? undefined : name || 'Invalid meter' };
    } catch (e: any) {
      return { success: false, message: e.message ?? 'Meter verification failed' };
    }
  }

  async buyElectricity(input: {
    meterNumber: string;
    plan: string;
    amount: number;
    type: string;
    phoneNumber: string;
  }): Promise<{ success: boolean; data?: any; message?: string }> {
    if (!this.enabled) return { success: false, message: 'Nellobyte not configured' };
    try {
      const discoCode = this.toDiscoCode(input.plan);
      const meterType = input.type?.toLowerCase().includes('prepaid') ? '01' : '02';
      const requestId = `ELEC-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const data = await this.get<any>('APIElectricityV1.asp', {
        ElectricCompany: discoCode,
        MeterType: meterType,
        MeterNo: input.meterNumber,
        Amount: String(input.amount),
        PhoneNo: input.phoneNumber || '08000000000',
        RequestID: requestId,
      });

      const orderId = data?.orderid;
      const statusCode = String(data?.statuscode ?? '');

      if (!orderId || statusCode !== '100') {
        const msg = data?.status ?? data?.description ?? 'Order not received';
        return { success: false, message: msg };
      }

      const poll = await this.waitForCompletion(orderId);
      if (!poll.success) {
        return { success: false, message: poll.message };
      }

      const token = data?.metertoken ?? null;
      return { success: true, data: { orderid: orderId, token, ...data } };
    } catch (e: any) {
      const msg = e.response?.data?.message ?? e.message ?? 'Electricity purchase failed';
      this.logger.error(`buyElectricity: ${msg}`);
      return { success: false, message: msg };
    }
  }

  // ── Cable TV (DStv, GOtv, StarTimes, Showmax) ─────────────────────────

  async getCableProviders(): Promise<{ id: string; name: string }[]> {
    if (!this.enabled) return [];
    return [
      { id: 'dstv', name: 'DStv' },
      { id: 'gotv', name: 'GOtv' },
      { id: 'startimes', name: 'StarTimes' },
      { id: 'showmax', name: 'Showmax' },
    ];
  }

  async getCablePackages(provider: string): Promise<{ package_code: string; name: string; price: number }[]> {
    if (!this.enabled) return [];
    try {
      const data = await this.get<any>('APICableTVPackagesV2.asp', {});
      if (!data || typeof data !== 'object') return this.getStaticCablePackages(provider);
      const prov = (provider || '').trim().toLowerCase();
      const key = prov.includes('dstv') ? 'DStv' : prov.includes('gotv') ? 'GOtv' : prov.includes('startimes') ? 'StarTimes' : prov.includes('showmax') ? 'Showmax' : null;
      if (!key) return this.getStaticCablePackages(provider);
      const items = data[key] ?? data[prov] ?? [];
      const arr = Array.isArray(items) ? items : [];
      const plans: { package_code: string; name: string; price: number }[] = [];
      for (const item of arr) {
        const code = item?.code ?? item?.id ?? item?.package ?? String(item ?? '');
        const name = item?.name ?? item?.description ?? item?.product ?? String(code);
        const price = Number(item?.price ?? item?.amount ?? item?.Amount ?? 0);
        if (code) plans.push({ package_code: String(code), name: String(name), price });
      }
      if (plans.length > 0) return plans;
    } catch (e: any) {
      this.logger.warn(`getCablePackages: ${e.message}`);
    }
    return this.getStaticCablePackages(provider);
  }

  private getStaticCablePackages(provider: string): { package_code: string; name: string; price: number }[] {
    const prov = (provider || '').toLowerCase();
    const dstv: { package_code: string; name: string; price: number }[] = [
      { package_code: 'dstv-padi', name: 'DStv Padi', price: 4400 },
      { package_code: 'dstv-yanga', name: 'DStv Yanga', price: 6000 },
      { package_code: 'dstv-confam', name: 'DStv Confam', price: 11000 },
      { package_code: 'dstv79', name: 'DStv Compact', price: 19000 },
      { package_code: 'dstv7', name: 'DStv Compact Plus', price: 30000 },
      { package_code: 'dstv3', name: 'DStv Premium', price: 44500 },
    ];
    const gotv: { package_code: string; name: string; price: number }[] = [
      { package_code: 'gotv-jolli', name: 'GOtv Jolli', price: 3900 },
      { package_code: 'gotv-max', name: 'GOtv Max', price: 6500 },
      { package_code: 'gotv-supa', name: 'GOtv Supa', price: 12000 },
    ];
    if (prov.includes('dstv')) return dstv;
    if (prov.includes('gotv')) return gotv;
    return dstv.concat(gotv);
  }

  async verifyCableSmartcard(cableTv: string, smartCardNo: string): Promise<{ success: boolean; message?: string }> {
    if (!this.enabled) return { success: false, message: 'Nellobyte not configured' };
    try {
      const data = await this.get<any>('APIVerifyCableTVV1.0.asp', {
        CableTV: (cableTv || 'dstv').toLowerCase(),
        SmartCardNo: smartCardNo,
      });
      const name = data?.customer_name ?? '';
      const valid = name && !name.toUpperCase().includes('INVALID');
      return { success: valid, message: valid ? undefined : name || 'Invalid smartcard' };
    } catch (e: any) {
      return { success: false, message: e.message ?? 'Verification failed' };
    }
  }

  async buyCableTV(input: {
    cableTv: string;
    packageCode: string;
    smartCardNo: string;
    phoneNumber: string;
  }): Promise<{ success: boolean; data?: any; message?: string }> {
    if (!this.enabled) return { success: false, message: 'Nellobyte not configured' };
    try {
      const requestId = `CABLETV-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const data = await this.get<any>('APICableTVV1.asp', {
        CableTV: (input.cableTv || 'dstv').toLowerCase(),
        Package: input.packageCode,
        SmartCardNo: input.smartCardNo,
        PhoneNo: input.phoneNumber || '08000000000',
        RequestID: requestId,
      });
      const orderId = data?.orderid;
      const statusCode = String(data?.statuscode ?? '');
      if (!orderId || statusCode !== '100') {
        const msg = data?.status ?? data?.description ?? 'Order not received';
        return { success: false, message: msg };
      }
      const poll = await this.waitForCompletion(orderId);
      if (!poll.success) return { success: false, message: poll.message };
      return { success: true, data: { orderid: orderId, ...data } };
    } catch (e: any) {
      const msg = e.response?.data?.message ?? e.message ?? 'Cable TV purchase failed';
      this.logger.error(`buyCableTV: ${msg}`);
      return { success: false, message: msg };
    }
  }

  // ── Betting ───────────────────────────────────────────────────────────

  async getBettingCompanies(): Promise<{ id: string; name: string }[]> {
    if (!this.enabled) return [];
    try {
      const data = await this.get<any>('APIBettingCompaniesV2.asp', {});
      if (data && typeof data === 'object') {
        const arr: { id: string; name: string }[] = [];
        if (Array.isArray(data)) {
          for (const item of data) {
            const id = item?.id ?? item?.code ?? item?.biller_id ?? '';
            const name = item?.name ?? item?.description ?? item?.biller_name ?? '';
            if (id && name) arr.push({ id: String(id), name: String(name) });
          }
        } else {
          for (const [code, val] of Object.entries(data)) {
            const name = typeof val === 'string' ? val : (val && typeof val === 'object' ? (val as any).name ?? (val as any).description ?? '' : String(val));
            if (code && name) arr.push({ id: String(code), name: String(name) });
          }
        }
        if (arr.length > 0) return arr;
      }
    } catch {
      /* fallback */
    }
    return [
      { id: 'NAIRABET', name: 'Nairabet' },
      { id: 'BET9JA', name: 'Bet9ja' },
      { id: '1XBET', name: '1xBet' },
      { id: 'SPORTYBET', name: 'SportyBet' },
    ];
  }

  async verifyBettingCustomer(company: string, customerId: string): Promise<{ success: boolean; message?: string }> {
    if (!this.enabled) return { success: false, message: 'Nellobyte not configured' };
    try {
      const data = await this.get<any>('APIVerifyBettingV1.asp', {
        BettingCompany: (company || '').toUpperCase(),
        CustomerID: customerId,
      });
      const name = data?.customer_name ?? '';
      const valid = name && !name.toUpperCase().includes('INVALID') && !name.toUpperCase().includes('ERROR');
      return { success: valid, message: valid ? undefined : name || 'Invalid customer ID' };
    } catch (e: any) {
      return { success: false, message: e.message ?? 'Verification failed' };
    }
  }

  async buyBetting(input: {
    company: string;
    customerId: string;
    amount: number;
  }): Promise<{ success: boolean; data?: any; message?: string }> {
    if (!this.enabled) return { success: false, message: 'Nellobyte not configured' };
    try {
      const requestId = `BET-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const data = await this.get<any>('APIBettingV1.asp', {
        BettingCompany: (input.company || '').toUpperCase(),
        CustomerID: input.customerId,
        Amount: String(input.amount),
        RequestID: requestId,
      });
      const orderId = data?.orderid;
      const statusCode = String(data?.statuscode ?? '');
      if (!orderId || statusCode !== '100') {
        const msg = data?.status ?? data?.description ?? 'Order not received';
        return { success: false, message: msg };
      }
      const poll = await this.waitForCompletion(orderId);
      if (!poll.success) return { success: false, message: poll.message };
      return { success: true, data: { orderid: orderId, ...data } };
    } catch (e: any) {
      const msg = e.response?.data?.message ?? e.message ?? 'Betting funding failed';
      this.logger.error(`buyBetting: ${msg}`);
      return { success: false, message: msg };
    }
  }
}
