import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  ArrowLeft, 
  Copy, 
  Check, 
  AlertTriangle, 
  Info,
  Clock,
  Shield,
  Wallet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

// Network configuration with warnings
const NETWORKS = {
  USDT: [
    { 
      id: "TRC20", 
      name: "Tron (TRC20)", 
      icon: "🔷",
      warnings: [
        "Send only USDT on Tron network (TRC20)",
        "Sending other assets or networks will result in permanent loss",
        "Minimum deposit: 10 USDT",
        "Confirmations required: 19 blocks (~3 minutes)"
      ],
      avgTime: "3 min"
    },
    { 
      id: "BEP20", 
      name: "BSC (BEP20)", 
      icon: "🟡",
      warnings: [
        "Send only USDT on BSC network (BEP20)",
        "Do not send USDC or other BEP20 tokens",
        "Minimum deposit: 10 USDT",
        "Confirmations required: 15 blocks (~45 seconds)"
      ],
      avgTime: "45 sec"
    },
    { 
      id: "ERC20", 
      name: "Ethereum (ERC20)", 
      icon: "💠",
      warnings: [
        "Send only USDT on Ethereum network (ERC20)",
        "High gas fees - only recommended for large deposits",
        "Minimum deposit: 100 USDT",
        "Confirmations required: 12 blocks (~3 minutes)"
      ],
      avgTime: "3 min"
    }
  ],
  BTC: [
    {
      id: "BTC",
      name: "Bitcoin",
      icon: "🟠",
      warnings: [
        "Send only Bitcoin (BTC)",
        "Minimum deposit: 0.001 BTC",
        "Confirmations required: 3 blocks (~30 minutes)"
      ],
      avgTime: "30 min"
    }
  ],
  ETH: [
    {
      id: "ETH",
      name: "Ethereum",
      icon: "💠",
      warnings: [
        "Send only Ethereum (ETH)",
        "High gas fees - only recommended for large deposits",
        "Minimum deposit: 0.05 ETH",
        "Confirmations required: 12 blocks (~3 minutes)"
      ],
      avgTime: "3 min"
    }
  ]
};

const ASSETS = [
  { id: "USDT", name: "Tether USD", icon: "💵", color: "bg-green-500" },
  { id: "BTC", name: "Bitcoin", icon: "🟠", color: "bg-orange-500" },
  { id: "ETH", name: "Ethereum", icon: "💠", color: "bg-blue-500" },
];

// Get API URL from environment - must be HTTPS in production
const getApiUrl = (): string => {
  const url = import.meta.env.VITE_API_URL || "http://localhost:3000";
  if (import.meta.env.PROD && url.startsWith("http:")) {
    console.error("SECURITY WARNING: Using HTTP in production!");
  }
  return url;
};

interface Deposit {
  id: string;
  asset: string;
  network: string;
  cryptoAmount: string;
  ngnAmount: string | null;
  status: string;
  createdAt: string;
}

const CryptoDeposit = () => {
  const [selectedAsset, setSelectedAsset] = useState<string>("USDT");
  const [selectedNetwork, setSelectedNetwork] = useState<string>("TRC20");
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [memo, setMemo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<string | null>(null);
  const [rateExpiry, setRateExpiry] = useState<Date | null>(null);
  const [recentDeposits, setRecentDeposits] = useState<Deposit[]>([]);
  const { token } = useAuth();
  const navigate = useNavigate();

  // Fetch exchange rate on mount
  useEffect(() => {
    fetchExchangeRate();
    fetchRecentDeposits();
    
    // Refresh rate every 10 minutes
    const interval = setInterval(fetchExchangeRate, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [selectedAsset]);

  const fetchRecentDeposits = async () => {
    try {
const response = await fetch(`${getApiUrl()}/crypto/deposits`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error("Failed to fetch deposits");
      
      const data = await response.json();
      setRecentDeposits(data.data.slice(0, 5));
    } catch (err) {
      console.error("Deposits fetch error:", err);
    }
  };

  const fetchExchangeRate = async () => {
    try {
const response = await fetch(`${getApiUrl()}/crypto/rates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error("Failed to fetch rates");
      
      const data = await response.json();
      const pair = `${selectedAsset}_NGN`;
      const rate = data.data[pair];
      
      setExchangeRate(rate);
      setRateExpiry(new Date(Date.now() + 15 * 60 * 1000)); // 15 min expiry
    } catch (err) {
      console.error("Rate fetch error:", err);
    }
  };

  const generateAddress = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/crypto/deposit-address`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          asset: selectedAsset,
          network: selectedNetwork,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to generate address");
      }

      const data = await response.json();
      setDepositAddress(data.data.address);
      setMemo(data.data.memo);
      
      toast({
        title: "Address Generated",
        description: `Your ${selectedAsset} ${selectedNetwork} deposit address is ready`,
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  };

  const currentNetwork = NETWORKS[selectedAsset as keyof typeof NETWORKS]?.find(
    (n) => n.id === selectedNetwork
  );

  const formatRate = () => {
    if (!exchangeRate) return "Loading...";
    const rate = parseFloat(exchangeRate);
    return `₦${rate.toLocaleString()} per ${selectedAsset}`;
  };

  const isRateExpired = () => {
    if (!rateExpiry) return true;
    return new Date() > rateExpiry;
  };

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
            <p className="text-xs text-muted-foreground">Receive USDT, BTC, or ETH</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-6">
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
            {isRateExpired() && (
              <span className="text-xs text-destructive flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Expired - Refreshing...
              </span>
            )}
          </div>
          <p className="text-2xl font-bold mt-1">{formatRate()}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Rates locked for 15 minutes • 0.5% spread applied
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
                  // Set default network for asset
                  const defaultNetwork = NETWORKS[asset.id as keyof typeof NETWORKS][0].id;
                  setSelectedNetwork(defaultNetwork);
                }}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  selectedAsset === asset.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <span className="text-2xl">{asset.icon}</span>
                <span className="font-semibold text-sm">{asset.id}</span>
                <span className="text-xs text-muted-foreground">{asset.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Network Selection */}
        <div>
          <label className="text-sm font-medium mb-3 block">Select Network</label>
          <div className="space-y-2">
            {NETWORKS[selectedAsset as keyof typeof NETWORKS]?.map((network) => (
              <button
                key={network.id}
                onClick={() => {
                  setSelectedNetwork(network.id);
                  setDepositAddress(null);
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
                <p className="font-semibold text-destructive text-sm">Critical Warnings</p>
                <ul className="mt-2 space-y-1">
                  {currentNetwork.warnings.map((warning, i) => (
                    <li key={i} className="text-xs text-destructive/80 flex items-start gap-2">
                      <span className="mt-1.5 h-1 w-1 rounded-full bg-destructive shrink-0" />
                      {warning}
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

        {/* Deposit Address Display */}
        {depositAddress && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border-2 border-primary bg-primary/5 p-6 space-y-4"
          >
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Your {selectedAsset} {selectedNetwork} Address</p>
              <div className="bg-background rounded-lg p-4 border border-border">
                <p className="font-mono text-sm break-all">{depositAddress}</p>
              </div>
            </div>

            {memo && (
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">Memo (Required)</p>
                <div className="bg-background rounded-lg p-4 border border-border">
                  <p className="font-mono text-sm break-all">{memo}</p>
                </div>
              </div>
            )}

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
                Deposits will be credited to your NGN balance after{" "}
                {currentNetwork?.warnings.find(w => w.includes("Confirmations"))?.match(/\d+/)?.[0] || "required"}{" "}
                network confirmations. Large deposits may be held for security review.
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
              {recentDeposits.map((deposit) => (
                <div
                  key={deposit.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
                >
                  <div>
                    <p className="font-medium">
                      {deposit.cryptoAmount} {deposit.asset}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {deposit.network} • {new Date(deposit.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {deposit.ngnAmount ? `₦${parseFloat(deposit.ngnAmount).toLocaleString()}` : "Pending"}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      deposit.status === "confirmed" 
                        ? "bg-green-500/10 text-green-500"
                        : deposit.status === "flagged"
                        ? "bg-yellow-500/10 text-yellow-500"
                        : "bg-blue-500/10 text-blue-500"
                    }`}>
                      {deposit.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Security Notice */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/50 text-sm">
          <Shield className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="font-medium">Security Protected</p>
            <p className="text-muted-foreground text-xs mt-1">
              All deposits are monitored by our Early Warning System. Suspicious deposits 
              may be held for up to 16 days per CBN guidelines. First-time crypto deposits 
              have a 1-hour hold period.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CryptoDeposit;
