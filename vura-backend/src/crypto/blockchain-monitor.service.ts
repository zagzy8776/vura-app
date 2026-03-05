import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import Decimal from 'decimal.js';

export interface VerifiedTransaction {
  found: boolean;
  txHash: string;
  from: string;
  to: string;
  amount: Decimal;
  asset: string;
  network: string;
  confirmations: number;
  confirmed: boolean;
  blockTimestamp?: number;
}

// USDT contract addresses per network
const USDT_CONTRACTS: Record<string, string> = {
  TRC20: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  BEP20: '0x55d398326f99059fF775485246999027B3197955',
};

const MIN_CONFIRMATIONS: Record<string, number> = {
  TRC20: 19,
  BEP20: 15,
  BTC: 3,
};

@Injectable()
export class BlockchainMonitorService {
  private readonly logger = new Logger(BlockchainMonitorService.name);
  private readonly bscscanKey: string;
  private readonly businessWallets: Record<string, string>;

  constructor(private config: ConfigService) {
    this.bscscanKey = this.config.get('BSCSCAN_API_KEY') || '';

    this.businessWallets = {
      USDT_TRC20: (this.config.get('BUSINESS_USDT_TRC20_ADDRESS') || '').toLowerCase(),
      USDT_BEP20: (this.config.get('BUSINESS_USDT_BEP20_ADDRESS') || '').toLowerCase(),
      BTC_BTC: (this.config.get('BUSINESS_BTC_ADDRESS') || '').toLowerCase(),
    };

    if (!this.bscscanKey) {
      this.logger.warn('BSCSCAN_API_KEY not set — BSC verification will be limited');
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  VERIFY BY TX HASH  — instant check when user provides a hash
  // ─────────────────────────────────────────────────────────────────────

  async verifyByTxHash(
    txHash: string,
    expectedAsset: string,
    expectedNetwork: string,
    expectedAmount: Decimal,
  ): Promise<VerifiedTransaction> {
    const notFound: VerifiedTransaction = {
      found: false,
      txHash,
      from: '',
      to: '',
      amount: new Decimal(0),
      asset: expectedAsset,
      network: expectedNetwork,
      confirmations: 0,
      confirmed: false,
    };

    try {
      if (expectedAsset === 'USDT' && expectedNetwork === 'TRC20') {
        return await this.verifyTronTx(txHash, expectedAmount);
      }
      if (expectedAsset === 'USDT' && expectedNetwork === 'BEP20') {
        return await this.verifyBscTokenTx(txHash, expectedAmount);
      }
      if (expectedAsset === 'BTC' && expectedNetwork === 'BTC') {
        return await this.verifyBtcTx(txHash, expectedAmount);
      }

      this.logger.warn(`No verifier for ${expectedAsset}/${expectedNetwork}`);
      return notFound;
    } catch (err) {
      this.logger.error(`verifyByTxHash failed: ${(err as Error).message}`);
      return notFound;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  SCAN WALLET — find recent incoming txs to the business wallet
  // ─────────────────────────────────────────────────────────────────────

  async scanWalletForDeposits(
    asset: string,
    network: string,
    sinceTimestamp: number,
  ): Promise<VerifiedTransaction[]> {
    try {
      if (asset === 'USDT' && network === 'TRC20') {
        return await this.scanTronWallet(sinceTimestamp);
      }
      if (asset === 'USDT' && network === 'BEP20') {
        return await this.scanBscWallet(sinceTimestamp);
      }
      if (asset === 'BTC' && network === 'BTC') {
        return await this.scanBtcWallet(sinceTimestamp);
      }
      return [];
    } catch (err) {
      this.logger.error(`scanWallet failed for ${asset}/${network}: ${(err as Error).message}`);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  TRON (TRC20 USDT) — via TronGrid (free, no key needed)
  // ─────────────────────────────────────────────────────────────────────

  private async verifyTronTx(txHash: string, expectedAmount: Decimal): Promise<VerifiedTransaction> {
    const walletAddr = this.businessWallets['USDT_TRC20'];
    const res = await axios.get(
      `https://api.trongrid.io/v1/transactions/${txHash}/events`,
      { timeout: 10000 },
    );

    const events = res.data?.data || [];

    // Look for a TRC20 Transfer event to our wallet
    for (const event of events) {
      if (event.event_name !== 'Transfer') continue;

      const to = (event.result?.to || '').toLowerCase();
      const contractAddr = (event.contract_address || '').toLowerCase();
      const rawValue = event.result?.value || '0';

      // USDT on Tron has 6 decimals
      const amount = new Decimal(rawValue).div(1e6);

      if (
        to === walletAddr &&
        contractAddr === USDT_CONTRACTS.TRC20.toLowerCase() &&
        this.amountMatches(amount, expectedAmount)
      ) {
        // Get block info for confirmations
        const txInfo = await axios.get(
          `https://api.trongrid.io/wallet/gettransactioninfobyid?value=${txHash}`,
          { timeout: 10000 },
        );
        const blockNumber = txInfo.data?.blockNumber || 0;
        const latestBlock = await this.getTronLatestBlock();
        const confirmations = latestBlock > 0 ? latestBlock - blockNumber : 0;

        return {
          found: true,
          txHash,
          from: event.result?.from || '',
          to,
          amount,
          asset: 'USDT',
          network: 'TRC20',
          confirmations,
          confirmed: confirmations >= MIN_CONFIRMATIONS.TRC20,
          blockTimestamp: event.block_timestamp,
        };
      }
    }

    return this.notFound(txHash, 'USDT', 'TRC20');
  }

  private async scanTronWallet(sinceTimestamp: number): Promise<VerifiedTransaction[]> {
    const walletAddr = this.config.get('BUSINESS_USDT_TRC20_ADDRESS') || '';
    if (!walletAddr) return [];

    const res = await axios.get(
      `https://api.trongrid.io/v1/accounts/${walletAddr}/transactions/trc20`,
      {
        params: {
          only_to: true,
          limit: 50,
          min_timestamp: sinceTimestamp,
          contract_address: USDT_CONTRACTS.TRC20,
        },
        timeout: 10000,
      },
    );

    const txs: VerifiedTransaction[] = [];
    const data = res.data?.data || [];
    const latestBlock = await this.getTronLatestBlock();

    for (const tx of data) {
      const to = (tx.to || '').toLowerCase();
      if (to !== walletAddr.toLowerCase()) continue;

      const amount = new Decimal(tx.value || '0').div(1e6);
      const blockNumber = tx.block_timestamp ? 0 : 0;
      const confirmations = latestBlock > 0 && tx.block_timestamp
        ? Math.max(0, Math.floor((Date.now() - tx.block_timestamp) / 3000))
        : 0;

      txs.push({
        found: true,
        txHash: tx.transaction_id,
        from: tx.from || '',
        to,
        amount,
        asset: 'USDT',
        network: 'TRC20',
        confirmations,
        confirmed: confirmations >= MIN_CONFIRMATIONS.TRC20,
        blockTimestamp: tx.block_timestamp,
      });
    }

    return txs;
  }

  private async getTronLatestBlock(): Promise<number> {
    try {
      const res = await axios.post(
        'https://api.trongrid.io/wallet/getnowblock',
        {},
        { timeout: 5000 },
      );
      return res.data?.block_header?.raw_data?.number || 0;
    } catch {
      return 0;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  BSC (BEP20 USDT) — via BscScan API (free tier, key recommended)
  // ─────────────────────────────────────────────────────────────────────

  private async verifyBscTokenTx(txHash: string, expectedAmount: Decimal): Promise<VerifiedTransaction> {
    const walletAddr = this.businessWallets['USDT_BEP20'];

    const params: any = {
      module: 'proxy',
      action: 'eth_getTransactionReceipt',
      txhash: txHash,
    };
    if (this.bscscanKey) params.apikey = this.bscscanKey;

    const res = await axios.get('https://api.bscscan.com/api', {
      params,
      timeout: 10000,
    });

    const receipt = res.data?.result;
    if (!receipt || receipt.status !== '0x1') {
      return this.notFound(txHash, 'USDT', 'BEP20');
    }

    // Parse Transfer logs for USDT contract
    const usdtContract = USDT_CONTRACTS.BEP20.toLowerCase();
    for (const log of receipt.logs || []) {
      if (log.address?.toLowerCase() !== usdtContract) continue;

      // Transfer topic: keccak256("Transfer(address,address,uint256)")
      const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      if (log.topics?.[0] !== transferTopic) continue;

      const to = '0x' + (log.topics?.[2] || '').slice(26).toLowerCase();

      // USDT on BSC has 18 decimals
      const rawValue = log.data || '0x0';
      const amount = new Decimal(BigInt(rawValue).toString()).div(new Decimal(10).pow(18));

      if (to === walletAddr && this.amountMatches(amount, expectedAmount)) {
        // Get confirmations
        const blockHex = receipt.blockNumber;
        const blockNumber = parseInt(blockHex, 16);
        const latestBlock = await this.getBscLatestBlock();
        const confirmations = latestBlock > 0 ? latestBlock - blockNumber : 0;

        return {
          found: true,
          txHash,
          from: receipt.from || '',
          to,
          amount,
          asset: 'USDT',
          network: 'BEP20',
          confirmations,
          confirmed: confirmations >= MIN_CONFIRMATIONS.BEP20,
        };
      }
    }

    return this.notFound(txHash, 'USDT', 'BEP20');
  }

  private async scanBscWallet(sinceTimestamp: number): Promise<VerifiedTransaction[]> {
    const walletAddr = this.config.get('BUSINESS_USDT_BEP20_ADDRESS') || '';
    if (!walletAddr || !this.bscscanKey) return [];

    const startBlock = await this.estimateBscBlock(sinceTimestamp);

    const res = await axios.get('https://api.bscscan.com/api', {
      params: {
        module: 'account',
        action: 'tokentx',
        contractaddress: USDT_CONTRACTS.BEP20,
        address: walletAddr,
        startblock: startBlock,
        endblock: 99999999,
        sort: 'desc',
        apikey: this.bscscanKey,
      },
      timeout: 10000,
    });

    const txs: VerifiedTransaction[] = [];
    const results = res.data?.result || [];
    const latestBlock = await this.getBscLatestBlock();

    for (const tx of results) {
      if (tx.to?.toLowerCase() !== walletAddr.toLowerCase()) continue;

      const decimals = parseInt(tx.tokenDecimal || '18');
      const amount = new Decimal(tx.value || '0').div(new Decimal(10).pow(decimals));
      const blockNumber = parseInt(tx.blockNumber || '0');
      const confirmations = latestBlock > 0 ? latestBlock - blockNumber : 0;

      txs.push({
        found: true,
        txHash: tx.hash,
        from: tx.from || '',
        to: tx.to || '',
        amount,
        asset: 'USDT',
        network: 'BEP20',
        confirmations,
        confirmed: confirmations >= MIN_CONFIRMATIONS.BEP20,
        blockTimestamp: parseInt(tx.timeStamp || '0') * 1000,
      });
    }

    return txs;
  }

  private async getBscLatestBlock(): Promise<number> {
    try {
      const params: any = { module: 'proxy', action: 'eth_blockNumber' };
      if (this.bscscanKey) params.apikey = this.bscscanKey;
      const res = await axios.get('https://api.bscscan.com/api', { params, timeout: 5000 });
      return parseInt(res.data?.result || '0', 16);
    } catch {
      return 0;
    }
  }

  private async estimateBscBlock(timestamp: number): Promise<number> {
    // BSC ~3 sec block time, rough estimate
    const now = Date.now();
    const latest = await this.getBscLatestBlock();
    const diffSeconds = (now - timestamp) / 1000;
    return Math.max(0, latest - Math.ceil(diffSeconds / 3));
  }

  // ─────────────────────────────────────────────────────────────────────
  //  BITCOIN — via Mempool.space API (open-source, free, no key needed)
  // ─────────────────────────────────────────────────────────────────────

  private async verifyBtcTx(txHash: string, expectedAmount: Decimal): Promise<VerifiedTransaction> {
    const walletAddr = this.businessWallets['BTC_BTC'];

    const res = await axios.get(
      `https://mempool.space/api/tx/${txHash}`,
      { timeout: 10000 },
    );

    const tx = res.data;
    if (!tx) return this.notFound(txHash, 'BTC', 'BTC');

    for (const vout of tx.vout || []) {
      const scriptAddr = (vout.scriptpubkey_address || '').toLowerCase();
      // BTC amounts are in satoshis
      const amount = new Decimal(vout.value || 0).div(1e8);

      if (scriptAddr === walletAddr && this.amountMatches(amount, expectedAmount)) {
        const confirmed = tx.status?.confirmed === true;
        const blockHeight = tx.status?.block_height || 0;
        const tipHeight = await this.getBtcTipHeight();
        const confirmations = confirmed && tipHeight > 0 ? tipHeight - blockHeight + 1 : 0;

        return {
          found: true,
          txHash,
          from: 'bitcoin',
          to: scriptAddr,
          amount,
          asset: 'BTC',
          network: 'BTC',
          confirmations,
          confirmed: confirmations >= MIN_CONFIRMATIONS.BTC,
          blockTimestamp: tx.status?.block_time ? tx.status.block_time * 1000 : undefined,
        };
      }
    }

    return this.notFound(txHash, 'BTC', 'BTC');
  }

  private async scanBtcWallet(sinceTimestamp: number): Promise<VerifiedTransaction[]> {
    const walletAddr = this.config.get('BUSINESS_BTC_ADDRESS') || '';
    if (!walletAddr) return [];

    const res = await axios.get(
      `https://mempool.space/api/address/${walletAddr}/txs`,
      { timeout: 10000 },
    );

    const txs: VerifiedTransaction[] = [];
    const tipHeight = await this.getBtcTipHeight();

    for (const tx of res.data || []) {
      const txTime = (tx.status?.block_time || 0) * 1000;
      if (txTime && txTime < sinceTimestamp) continue;

      for (const vout of tx.vout || []) {
        const scriptAddr = (vout.scriptpubkey_address || '').toLowerCase();
        if (scriptAddr !== walletAddr.toLowerCase()) continue;

        const amount = new Decimal(vout.value || 0).div(1e8);
        const confirmed = tx.status?.confirmed === true;
        const blockHeight = tx.status?.block_height || 0;
        const confirmations = confirmed && tipHeight > 0 ? tipHeight - blockHeight + 1 : 0;

        txs.push({
          found: true,
          txHash: tx.txid,
          from: 'bitcoin',
          to: scriptAddr,
          amount,
          asset: 'BTC',
          network: 'BTC',
          confirmations,
          confirmed: confirmations >= MIN_CONFIRMATIONS.BTC,
          blockTimestamp: txTime || undefined,
        });
      }
    }

    return txs;
  }

  private async getBtcTipHeight(): Promise<number> {
    try {
      const res = await axios.get('https://mempool.space/api/blocks/tip/height', { timeout: 5000 });
      return parseInt(res.data || '0');
    } catch {
      return 0;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  HELPERS
  // ─────────────────────────────────────────────────────────────────────

  private amountMatches(actual: Decimal, expected: Decimal): boolean {
    if (expected.isZero()) return actual.greaterThan(0);
    // Allow 2% tolerance for network fees / rounding
    const diff = actual.sub(expected).abs();
    const tolerance = expected.mul(0.02);
    return diff.lessThanOrEqualTo(tolerance);
  }

  private notFound(txHash: string, asset: string, network: string): VerifiedTransaction {
    return {
      found: false,
      txHash,
      from: '',
      to: '',
      amount: new Decimal(0),
      asset,
      network,
      confirmations: 0,
      confirmed: false,
    };
  }
}
