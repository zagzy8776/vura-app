import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Copy,
  Check,
  AlertTriangle,
  Info,
  Clock,
  Shield,
  Wallet,
  RefreshCw,
  Calculator,
  Banknote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";

// ── Network / asset config ────────────────────────────────────────────
const NETWORKS: Record<string, NetworkInfo[]> = {
  USDT: [
    {
      id: "TRC20",
      name: "Tron (TRC20)",
      icon: "🔷",
      ivoryNetwork: "tron",
      warnings: [
        "Send only USDT on Tron network (TRC20)",
        "Sending other assets will result in permanent loss",
        "Minimum deposit: 10 USDT",
        "Auto-converted to Naira on arrival",
      ],
      avgTime: "3 min",
    },
    {
      id: "BEP20",
      name: "BSC (BEP20)",
      icon: "🟡",
      ivoryNetwork: "bsc",
      warnings: [
        "Do not deposit USDT via the opBNB chain",
        "Deposits made through opBNB will result in permanent asset loss",
        "Send only USDT on BSC network (BEP20)",
        "Do not send USDC or other BEP20 tokens",
        "Minimum deposit: 10 USDT",
      ],
      avgTime: "45 sec",
    },
    {
      id: "ERC20",
      name: "Ethereum (ERC20)",
      icon: "💠",
      ivoryNetwork: "ethereum",
      warnings: [
        "Send only USDT on Ethereum network (ERC20)",
        "High gas fees — only for large deposits",
        "Minimum deposit: 100 USDT",
      ],
      avgTime: "3 min",
    },
  ],
  BTC: [
    {
      id: "BTC",
      name: "Bitcoin",
      icon: "🟠",
      ivoryNetwork: "bitcoin",
      warnings: [
        "Send only Bitcoin (BTC)",
        "Minimum deposit: 0.001 BTC",
        "3 confirmations (~30 minutes)",
      ],
      avgTime: "30 min",
    },
  ],
  ETH: [
    {
      id: "ETH",
      name: "Ethereum",
      icon: "💠",
      ivoryNetwork: "ethereum",
      warnings: [
        "Send only Ethereum (ETH)",
        "High gas fees — only for large deposits",
        "Minimum deposit: 0.05 ETH",
      ],
      avgTime: "3 min",
    },
  ],
};

const ASSETS = [
  { id: "USDT", name: "Tether USD", icon: "💵", color: "bg-green-500" },
  { id: "BTC", name: "Bitcoin", icon: "🟠", color: "bg-orange-500" },
  { id: "ETH", name: "Ethereum", icon: "💠", color: "bg-blue-500" },
];

interface NetworkInfo {
  id: string;
  name: string;
  icon: string;
  ivoryNetwork: string;
  warnings: string[];
  avgTime: string;
}

interface DepositTx {
  id: string;
  cryptoAmount: string;
  ngnAmount: string;
  status: string;
  createdAt: string;
}

interface DepositRecord {
  id: string;
  asset: string;
  network: string;
  address: string;
  status: string;
  createdAt: string;
  transactions: DepositTx[];
}

// ── Component ─────────────────────────────────────────────────────────

const CryptoDeposit = () => {
  const [selectedAsset, setSelectedAsset] = useState("USDT");
  const [selectedNetwork, setSelectedNetwork] = useState("TRC20");
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [memo, setMemo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [exchangeRate, setExchangeRate] = useState<string | null>(null);
  const [rateExpiry, setRateExpiry] = useState<Date | null>(null);
  const [recentDeposits, setRecentDeposits] = useState<DepositRecord[]>([]);

  // IvoryPay rate preview
  const [previewAmount, setPreviewAmount] = useState("50");
  const [previewNgn, setPreviewNgn] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const { token } = useAuth();
  const navigate = useNavigate();

  // ── Data fetchers ──────────────────────────────────────────────────

  const fetchExchangeRate = useCallback(async () => {
    try {
      const res = await apiFetch("/crypto/rates");
      if (!res.ok) return;
      const json = await res.json();
      const pair = `${selectedAsset}_NGN`;
      setExchangeRate(json.data?.[pair] ?? null);
      setRateExpiry(new Date(Date.now() + 15 * 60_000));
    } catch (err) {
      console.error("Rate fetch error:", err);
    }
  }, [selectedAsset]);

  const fetchRecentDeposits = useCallback(async () => {
    try {
      const res = await apiFetch("/crypto/deposits");
      if (!res.ok) return;
      const json = await res.json();
      setRecentDeposits((json.data ?? []).slice(0, 5));
    } catch (err) {
      console.error("Deposits fetch error:", err);
    }
  }, []);

  useEffect(() => {
    fetchExchangeRate();
    fetchRecentDeposits();
    const interval = setInterval(fetchExchangeRate, 10 * 60_000);
    return () => clearInterval(interval);
  }, [fetchExchangeRate, fetchRecentDeposits]);

  // ── IvoryPay rate preview ──────────────────────────────────────────

  const fetchIvoryPayPreview = useCallback(async () => {
    if (!previewAmount || parseFloat(previewAmount) <= 0) return;
    setPreviewLoading(true);
    try {
      const res = await apiFetch(
        `/ivorypay/rates?amount=${previewAmount}&crypto=${selectedAsset}&fiat=NGN`,
      );
      if (!res.ok) return;
      const json = await res.json();
      setPreviewNgn(json.data?.fiatEquivalent ?? null);
    } catch (err) {
      console.error("IvoryPay rate error:", err);
    } finally {
      setPreviewLoading(false);
    }
  }, [previewAmount, selectedAsset]);

  useEffect(() => {
    const timer = setTimeout(fetchIvoryPayPreview, 500);
    return () => clearTimeout(timer);
  }, [fetchIvoryPayPreview]);

  // ── Generate deposit address via IvoryPay + QR ─────────────────────

  const generateAddress = async () => {
    setLoading(true);
    try {
      const network = NETWORKS[selectedAsset]?.find(
        (n) => n.id === selectedNetwork,
      );

      // Use IvoryPay for permanent address
      const res = await apiFetch("/ivorypay/deposit-address", {
        method: "POST",
        body: JSON.stringify({
          crypto: selectedAsset,
          network: network?.ivoryNetwork || "tron",
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          (errBody as Record<string, string>).message ||
            "Failed to generate address",
        );
      }

      const json = await res.json();
      const addr: string = json.data?.address;

      setDepositAddress(addr);
      setMemo(null);

      const qr = await QRCode.toDataURL(addr, {
        width: 220,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });
      setQrDataUrl(qr);

      toast({
        title: "Address Ready",
        description: `Send ${selectedAsset} to this address. We'll auto-convert to Naira.`,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Clipboard ──────────────────────────────────────────────────────

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  };

  // ── Helpers ────────────────────────────────────────────────────────

  const currentNetwork = NETWORKS[selectedAsset]?.find(
    (n) => n.id === selectedNetwork,
  );

  const formatRate = () => {
    if (!exchangeRate) return "Loading...";
    return `₦${parseFloat(exchangeRate).toLocaleString()} per ${selectedAsset}`;
  };

  const isRateExpired = () => !rateExpiry || new Date() > rateExpiry;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-4 px-4 py-4 max-w-2xl mx-auto">
          <button
            onClick={() => navigate("/")}
            className="p-2 hover:bg-muted rounded-full transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold">Deposit & Convert</h1>
            <p className="text-xs text-muted-foreground">
              Send crypto, receive Naira instantly
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-6 pb-24">
        {/* Rate Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 p-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Current Rate</span>
            </div>
            {isRateExpired() ? (
              <button
                onClick={fetchExchangeRate}
                className="text-xs text-destructive flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </button>
            ) : null}
          </div>
          <p className="text-2xl font-bold mt-1">{formatRate()}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Rates locked for 15 minutes &bull; 1% spread applied
          </p>
        </motion.div>

        {/* IvoryPay Rate Preview Calculator */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-border bg-card p-4 space-y-3"
        >
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Payout Preview</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">
                You send
              </label>
              <div className="flex items-center gap-2 bg-background rounded-lg border border-border px-3 py-2">
                <input
                  type="number"
                  value={previewAmount}
                  onChange={(e) => setPreviewAmount(e.target.value)}
                  className="flex-1 bg-transparent text-lg font-semibold outline-none w-0"
                  placeholder="50"
                  min="1"
                />
                <span className="text-sm font-medium text-muted-foreground">
                  {selectedAsset}
                </span>
              </div>
            </div>

            <div className="pt-5 text-muted-foreground">→</div>

            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">
                You receive
              </label>
              <div className="flex items-center gap-2 bg-green-500/5 rounded-lg border border-green-500/20 px-3 py-2">
                <Banknote className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-lg font-bold text-green-600 truncate">
                  {previewLoading
                    ? "..."
                    : previewNgn
                      ? `₦${parseFloat(previewNgn).toLocaleString()}`
                      : "—"}
                </span>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Live rate via CoinGecko &bull; Final amount confirmed at deposit time
          </p>
        </motion.div>

        {/* Asset Selection */}
        <div>
          <label className="text-sm font-medium mb-3 block">Select Asset</label>
          <div className="grid grid-cols-3 gap-3">
            {ASSETS.map((asset) => (
              <button
                key={asset.id}
                onClick={() => {
                  setSelectedAsset(asset.id);
                  setDepositAddress(null);
                  setQrDataUrl(null);
                  setSelectedNetwork(NETWORKS[asset.id][0].id);
                }}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  selectedAsset === asset.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <span className="text-2xl">{asset.icon}</span>
                <span className="font-semibold text-sm">{asset.id}</span>
                <span className="text-xs text-muted-foreground">
                  {asset.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Network Selection */}
        <div>
          <label className="text-sm font-medium mb-3 block">
            Select Network
          </label>
          <div className="space-y-2">
            {NETWORKS[selectedAsset]?.map((network) => (
              <button
                key={network.id}
                onClick={() => {
                  setSelectedNetwork(network.id);
                  setDepositAddress(null);
                  setQrDataUrl(null);
                }}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                  selectedNetwork === network.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <span className="text-2xl">{network.icon}</span>
                <div className="flex-1">
                  <p className="font-semibold">{network.name}</p>
                  <p className="text-xs text-muted-foreground">
                    ~{network.avgTime} confirmation time
                  </p>
                </div>
                {selectedNetwork === network.id && (
                  <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Critical Warnings */}
        {currentNetwork && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-destructive text-sm">
                  Critical Warnings
                </p>
                <ul className="mt-2 space-y-1">
                  {currentNetwork.warnings.map((w, i) => (
                    <li
                      key={i}
                      className="text-xs text-destructive/80 flex items-start gap-2"
                    >
                      <span className="mt-1.5 h-1 w-1 rounded-full bg-destructive shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}

        {/* Generate Address Button */}
        {!depositAddress && (
          <Button
            onClick={generateAddress}
            disabled={loading}
            className="w-full h-14 rounded-xl gradient-brand text-primary-foreground font-semibold text-lg"
          >
            {loading ? "Generating..." : "Generate Deposit Address"}
          </Button>
        )}

        {/* Deposit Address + QR Code Display */}
        {depositAddress && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border-2 border-primary bg-primary/5 p-6 space-y-5"
          >
            {/* QR Code */}
            {qrDataUrl && (
              <div className="flex justify-center">
                <div className="bg-white p-3 rounded-xl shadow-md">
                  <img
                    src={qrDataUrl}
                    alt={`${selectedAsset} ${selectedNetwork} QR code`}
                    width={220}
                    height={220}
                  />
                </div>
              </div>
            )}

            {/* Address text */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">
                Your {selectedAsset} {selectedNetwork} Address
              </p>
              <div className="bg-background rounded-lg p-4 border border-border">
                <p className="font-mono text-sm break-all">{depositAddress}</p>
              </div>
            </div>

            {/* Memo (if applicable) */}
            {memo && (
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  Memo (Required)
                </p>
                <div className="bg-background rounded-lg p-4 border border-border">
                  <p className="font-mono text-sm break-all">{memo}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => copyToClipboard(memo)}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy Memo
                </Button>
              </div>
            )}

            {/* Copy address */}
            <Button
              onClick={() => copyToClipboard(depositAddress)}
              variant="outline"
              className="w-full h-12 rounded-xl"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Address
                </>
              )}
            </Button>

            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="h-4 w-4 shrink-0" />
              <p>
                Vura monitors the blockchain for your deposit. Once
                confirmed, your Naira balance is credited automatically. If
                Auto-Sweep is on, Naira goes straight to your bank.
              </p>
            </div>
          </motion.div>
        )}

        {/* Recent Deposits */}
        {recentDeposits.length > 0 && (
          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recent Deposits
            </h3>
            <div className="space-y-2">
              {recentDeposits.map((deposit) => {
                const lastTx = deposit.transactions?.[0];
                return (
                  <div
                    key={deposit.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
                  >
                    <div>
                      <p className="font-medium">
                        {lastTx
                          ? `${lastTx.cryptoAmount} ${deposit.asset}`
                          : deposit.asset}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {deposit.network} &bull;{" "}
                        {new Date(deposit.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {lastTx?.ngnAmount && lastTx.ngnAmount !== "0"
                          ? `₦${parseFloat(lastTx.ngnAmount).toLocaleString()}`
                          : "Pending"}
                      </p>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          lastTx?.status === "confirmed"
                            ? "bg-green-500/10 text-green-500"
                            : lastTx?.status === "flagged"
                              ? "bg-yellow-500/10 text-yellow-500"
                              : "bg-blue-500/10 text-blue-500"
                        }`}
                      >
                        {lastTx?.status ?? deposit.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Security Notice */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/50 text-sm">
          <Shield className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="font-medium">Powered by Vura</p>
            <p className="text-muted-foreground text-xs mt-1">
              Deposits are monitored in real-time. Naira is credited the moment
              the blockchain confirms your transaction. Enable Auto-Sweep in
              Settings to send Naira directly to your bank account.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CryptoDeposit;
