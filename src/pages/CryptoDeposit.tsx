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
      warnings: [
        "Send only USDT on Tron network (TRC20)",
        "Sending other assets or networks will result in permanent loss",
        "Minimum deposit: 10 USDT",
        "Confirmations required: 19 blocks (~3 minutes)",
      ],
      avgTime: "3 min",
    },
    {
      id: "BEP20",
      name: "BSC (BEP20)",
      icon: "🟡",
      warnings: [
        "Send only USDT on BSC network (BEP20)",
        "Do not send USDC or other BEP20 tokens",
        "Minimum deposit: 10 USDT",
        "Confirmations required: 15 blocks (~45 seconds)",
      ],
      avgTime: "45 sec",
    },
    {
      id: "ERC20",
      name: "Ethereum (ERC20)",
      icon: "💠",
      warnings: [
        "Send only USDT on Ethereum network (ERC20)",
        "High gas fees — only recommended for large deposits",
        "Minimum deposit: 100 USDT",
        "Confirmations required: 12 blocks (~3 minutes)",
      ],
      avgTime: "3 min",
    },
  ],
  BTC: [
    {
      id: "BTC",
      name: "Bitcoin",
      icon: "🟠",
      warnings: [
        "Send only Bitcoin (BTC)",
        "Minimum deposit: 0.001 BTC",
        "Confirmations required: 3 blocks (~30 minutes)",
      ],
      avgTime: "30 min",
    },
  ],
  ETH: [
    {
      id: "ETH",
      name: "Ethereum",
      icon: "💠",
      warnings: [
        "Send only Ethereum (ETH)",
        "High gas fees — only recommended for large deposits",
        "Minimum deposit: 0.05 ETH",
        "Confirmations required: 12 blocks (~3 minutes)",
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

  // ── Generate deposit address + QR ──────────────────────────────────

  const generateAddress = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/crypto/deposit-address", {
        method: "POST",
        body: JSON.stringify({
          asset: selectedAsset,
          network: selectedNetwork,
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
      const addrMemo: string | undefined = json.data?.memo;

      setDepositAddress(addr);
      setMemo(addrMemo ?? null);

      // Build QR data-URL
      const qr = await QRCode.toDataURL(addr, {
        width: 200,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });
      setQrDataUrl(qr);

      toast({
        title: "Address Generated",
        description: `Your ${selectedAsset} ${selectedNetwork} deposit address is ready`,
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
            <h1 className="text-lg font-semibold">Deposit Crypto</h1>
            <p className="text-xs text-muted-foreground">
              Receive USDT, BTC, or ETH — auto-converted to Naira
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
            Rates locked for 15 minutes &bull; 0.5% spread applied
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
                    width={200}
                    height={200}
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
                Deposits are auto-converted to NGN after network confirmations.
                Large deposits may be held for security review.
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
            <p className="font-medium">Security Protected</p>
            <p className="text-muted-foreground text-xs mt-1">
              All deposits are monitored by our Early Warning System. Suspicious
              deposits may be held for up to 16 days per CBN guidelines.
              First-time crypto deposits have a 1-hour hold period.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CryptoDeposit;
