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
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
        "Sending other assets will result in permanent loss",
        "Minimum deposit: 10 USDT",
      ],
      avgTime: "~3 min",
    },
    {
      id: "BEP20",
      name: "BSC (BEP20)",
      icon: "🟡",
      warnings: [
        "Do not deposit USDT via the opBNB chain",
        "Send only USDT on BSC network (BEP20)",
        "Do not send USDC or other BEP20 tokens",
        "Minimum deposit: 10 USDT",
      ],
      avgTime: "~45 sec",
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
        "3 confirmations (~30 minutes)",
      ],
      avgTime: "~30 min",
    },
  ],
};

const ASSETS = [
  { id: "USDT", name: "Tether USD", icon: "💵", color: "bg-green-500" },
  { id: "BTC", name: "Bitcoin", icon: "🟠", color: "bg-orange-500" },
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
  confirmations?: number;
  txHash?: string;
  createdAt: string;
  creditedAt?: string;
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

interface DepositStatusResponse {
  id: string;
  status: string;
  asset: string;
  network: string;
  cryptoAmount: string;
  ngnAmount: string;
  confirmations: number;
  txHash: string;
  creditedAt: string | null;
  message: string;
}

// ── Component ─────────────────────────────────────────────────────────

const VERIFY_PHASES = [
  { key: "submitted", label: "Deposit submitted to Vura" },
  { key: "scanning", label: "Scanning blockchain for transaction..." },
  { key: "confirming", label: "Transaction found — waiting for confirmations..." },
  { key: "credited", label: "Verified & credited to your account!" },
];

const CryptoDeposit = () => {
  const [step, setStep] = useState<"select" | "address" | "verifying" | "done">("select");
  const [selectedAsset, setSelectedAsset] = useState("USDT");
  const [selectedNetwork, setSelectedNetwork] = useState("TRC20");
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [rates, setRates] = useState<Record<string, string>>({});

  // Live verification state (real polling, not fake animation)
  const [activeDepositTxId, setActiveDepositTxId] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<DepositStatusResponse | null>(null);
  const [verifyPhase, setVerifyPhase] = useState(0); // index into VERIFY_PHASES

  // Preview calculator
  const [previewAmount, setPreviewAmount] = useState("50");
  const [previewNgn, setPreviewNgn] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Confirm form
  const [sentAmount, setSentAmount] = useState("");
  const [txHash, setTxHash] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [recentDeposits, setRecentDeposits] = useState<DepositRecord[]>([]);

  const navigate = useNavigate();

  // ── Fetch rates (CoinGecko — single source) ────────────────────────

  const fetchRates = useCallback(async () => {
    try {
      const res = await apiFetch("/crypto/rates");
      if (!res.ok) return;
      const json = await res.json();
      setRates(json.data ?? {});
    } catch (err) {
      console.error("Rate fetch error:", err);
    }
  }, []);

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
    fetchRates();
    fetchRecentDeposits();
    const interval = setInterval(fetchRates, 5 * 60_000);
    return () => clearInterval(interval);
  }, [fetchRates, fetchRecentDeposits]);

  // ── Preview calculator (debounced) ──────────────────────────────────

  useEffect(() => {
    if (!previewAmount || parseFloat(previewAmount) <= 0) {
      setPreviewNgn(null);
      return;
    }

    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(
          `/crypto/preview?amount=${previewAmount}&asset=${selectedAsset}`,
        );
        if (!res.ok) return;
        const json = await res.json();
        setPreviewNgn(json.data?.fiatEquivalent ?? null);
      } catch {
        setPreviewNgn(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [previewAmount, selectedAsset]);

  // ── Generate deposit address ────────────────────────────────────────

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
          (errBody as Record<string, string>).message || "Failed to get address",
        );
      }

      const json = await res.json();
      const addr: string = json.data?.address;

      setDepositAddress(addr);

      const qr = await QRCode.toDataURL(addr, {
        width: 220,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });
      setQrDataUrl(qr);
      setStep("address");

      toast({
        title: "Address Ready",
        description: `Send ${selectedAsset} to this address, then confirm below.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── User confirms they sent ─────────────────────────────────────────

  // ── Real blockchain polling ─────────────────────────────────────────

  useEffect(() => {
    if (!activeDepositTxId || step !== "verifying") return;

    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 200; // ~16 min at 5s interval

    const poll = async () => {
      if (cancelled) return;
      attempts++;

      try {
        const res = await apiFetch(`/crypto/deposit-status/${activeDepositTxId}`);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const data: DepositStatusResponse = json.data;
        setVerifyStatus(data);

        // Map backend status to phase index
        if (data.status === "pending") {
          setVerifyPhase(1); // scanning
        } else if (data.status === "confirming") {
          setVerifyPhase(2); // found, waiting for confirmations
        } else if (data.status === "confirmed") {
          setVerifyPhase(3); // done
          setTimeout(() => {
            setStep("done");
            fetchRecentDeposits();
          }, 1500);
          return; // stop polling
        } else if (data.status === "failed") {
          setVerifyPhase(-1); // error
          return; // stop polling
        }
      } catch {
        // Network error — keep polling
      }

      if (!cancelled && attempts < MAX_ATTEMPTS) {
        setTimeout(poll, 5000);
      }
    };

    // Kick off first poll after a short delay
    setVerifyPhase(0); // "submitted"
    const initialDelay = setTimeout(poll, 2000);

    return () => {
      cancelled = true;
      clearTimeout(initialDelay);
    };
  }, [activeDepositTxId, step, fetchRecentDeposits]);

  const handleConfirmSent = async () => {
    if (!sentAmount || parseFloat(sentAmount) <= 0) {
      toast({ title: "Enter the amount you sent", variant: "destructive" });
      return;
    }

    setConfirmLoading(true);
    try {
      const res = await apiFetch("/crypto/confirm-sent", {
        method: "POST",
        body: JSON.stringify({
          asset: selectedAsset,
          network: selectedNetwork,
          amount: sentAmount,
          txHash: txHash || undefined,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          (errBody as Record<string, string>).message || "Failed to submit",
        );
      }

      const json = await res.json();
      const txId: string = json.data?.id;

      // Switch to verification screen and start polling
      setActiveDepositTxId(txId);
      setVerifyStatus(null);
      setVerifyPhase(0);
      setStep("verifying");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setConfirmLoading(false);
    }
  };

  // ── Clipboard ────────────────────────────────────────────────────────

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  };

  // ── Helpers ──────────────────────────────────────────────────────────

  const currentNetwork = NETWORKS[selectedAsset]?.find(
    (n) => n.id === selectedNetwork,
  );

  const currentRate = rates[`${selectedAsset}_NGN`];

  const formatRate = () => {
    if (!currentRate || currentRate === "0") return "Loading...";
    return `₦${parseFloat(currentRate).toLocaleString()} per ${selectedAsset}`;
  };

  const resetFlow = () => {
    setStep("select");
    setDepositAddress(null);
    setQrDataUrl(null);
    setSentAmount("");
    setTxHash("");
    setActiveDepositTxId(null);
    setVerifyStatus(null);
    setVerifyPhase(0);
  };

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-4 px-4 py-4 max-w-2xl mx-auto">
          <button
            onClick={() => (step === "select" ? navigate("/") : resetFlow())}
            className="p-2 hover:bg-muted rounded-full transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold">Deposit Crypto</h1>
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
            <button
              onClick={fetchRates}
              className="text-xs text-muted-foreground flex items-center gap-1 hover:text-primary transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          </div>
          <p className="text-2xl font-bold mt-1">{formatRate()}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Live market rate &bull; Updated every 5 minutes
          </p>
        </motion.div>

        {/* Payout Preview Calculator */}
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

            <div className="pt-5 text-muted-foreground">&rarr;</div>

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
            Rate updates in real-time &bull; Final amount locked at confirmation
          </p>
        </motion.div>

        {/* ── Step: Select Asset & Network ──────────────────────────── */}
        {step === "select" && (
          <>
            {/* Asset Selection */}
            <div>
              <label className="text-sm font-medium mb-3 block">
                Select Asset
              </label>
              <div className="grid grid-cols-2 gap-3">
                {ASSETS.map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => {
                      setSelectedAsset(asset.id);
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
                    onClick={() => setSelectedNetwork(network.id)}
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
                        {network.avgTime} confirmation time
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

            {/* Warnings */}
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
                      Important Warnings
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
            <Button
              onClick={generateAddress}
              disabled={loading}
              className="w-full h-14 rounded-xl gradient-brand text-primary-foreground font-semibold text-lg"
            >
              {loading ? "Getting Address..." : "Get Deposit Address"}
            </Button>
          </>
        )}

        {/* ── Step: Show Address + QR ──────────────────────────────── */}
        {step === "address" && depositAddress && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-5"
          >
            <div className="rounded-xl border-2 border-primary bg-primary/5 p-6 space-y-5">
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

              {/* Address */}
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  Send {selectedAsset} ({selectedNetwork}) to:
                </p>
                <div className="bg-background rounded-lg p-4 border border-border">
                  <p className="font-mono text-sm break-all">{depositAddress}</p>
                </div>
              </div>

              {/* Copy */}
              <Button
                onClick={() => copyToClipboard(depositAddress)}
                variant="outline"
                className="w-full h-12 rounded-xl"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" /> Copy Address
                  </>
                )}
              </Button>
            </div>

            {/* How it works */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <p className="text-sm font-medium">How it works</p>
              <ol className="space-y-2 text-xs text-muted-foreground">
                <li className="flex gap-2">
                  <span className="font-bold text-primary">1.</span>
                  Send {selectedAsset} to the address above from your wallet
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">2.</span>
                  Fill in the amount and (optionally) the transaction hash below
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">3.</span>
                  Vura verifies on-chain and credits Naira to your balance
                </li>
              </ol>
            </div>

            {/* Confirm Form */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <p className="text-sm font-medium flex items-center gap-2">
                <Send className="h-4 w-4 text-primary" />
                I&apos;ve Sent the Money
              </p>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Amount sent ({selectedAsset})
                </label>
                <input
                  type="number"
                  value={sentAmount}
                  onChange={(e) => setSentAmount(e.target.value)}
                  placeholder={`e.g. 50`}
                  className="w-full bg-background rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  min="0"
                  step="any"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  Transaction hash (optional — speeds up verification)
                </label>
                <input
                  type="text"
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  placeholder="e.g. 0xabc123..."
                  className="w-full bg-background rounded-lg border border-border px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <Button
                onClick={handleConfirmSent}
                disabled={confirmLoading || !sentAmount}
                className="w-full h-12 rounded-xl gradient-brand text-primary-foreground font-semibold"
              >
                {confirmLoading ? "Submitting..." : "Confirm — I've Sent the Money"}
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── Step: Verifying on Blockchain (real polling) ────────── */}
        {step === "verifying" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border-2 border-primary/30 bg-primary/5 p-8 space-y-6"
          >
            {/* Spinning icon (shown while not yet confirmed/failed) */}
            {verifyPhase >= 0 && verifyPhase < 3 && (
              <div className="flex justify-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary flex items-center justify-center"
                />
              </div>
            )}

            {/* Success icon */}
            {verifyPhase === 3 && (
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                  <Check className="h-8 w-8 text-green-500" />
                </div>
              </div>
            )}

            {/* Failed icon */}
            {verifyPhase === -1 && (
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-8 w-8 text-red-500" />
                </div>
              </div>
            )}

            <div className="text-center space-y-2">
              <h2 className="text-lg font-bold">
                {verifyPhase === 3
                  ? "Deposit Verified!"
                  : verifyPhase === -1
                    ? "Verification Failed"
                    : "Verifying on Blockchain"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {verifyStatus?.message ||
                  "Scanning blockchain for your transaction..."}
              </p>
            </div>

            {/* Confirmation counter */}
            {verifyStatus && verifyPhase >= 2 && verifyPhase < 3 && (
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">
                  {verifyStatus.confirmations} confirmations
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Waiting for network to finalize...
                </p>
              </div>
            )}

            {/* Phase steps */}
            <div className="space-y-2">
              {VERIFY_PHASES.map((phase, i) => (
                <motion.div
                  key={phase.key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{
                    opacity: i <= verifyPhase ? 1 : 0.3,
                    x: 0,
                  }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-3 text-sm"
                >
                  {i < verifyPhase ? (
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                  ) : i === verifyPhase && verifyPhase >= 0 ? (
                    <motion.div
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="h-4 w-4 rounded-full bg-primary shrink-0"
                    />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                  )}
                  <span
                    className={
                      i <= verifyPhase
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    {phase.label}
                  </span>
                </motion.div>
              ))}
            </div>

            {/* Failed state — action buttons */}
            {verifyPhase === -1 && (
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={resetFlow}
                  variant="outline"
                  className="flex-1 rounded-xl"
                >
                  Try Again
                </Button>
                <Button
                  onClick={() =>
                    window.open("mailto:support@vura.app", "_blank")
                  }
                  className="flex-1 rounded-xl"
                >
                  Contact Support
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Step: Done ───────────────────────────────────────────── */}
        {step === "done" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border-2 border-green-500/30 bg-green-500/5 p-6 text-center space-y-4"
          >
            <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-xl font-bold">Deposit Verified & Credited!</h2>
            <p className="text-sm text-muted-foreground">
              Your deposit of{" "}
              <span className="font-semibold text-foreground">
                {verifyStatus?.cryptoAmount ?? sentAmount} {selectedAsset}
              </span>{" "}
              has been verified on the blockchain
              {verifyStatus?.ngnAmount && verifyStatus.ngnAmount !== "0" && (
                <>
                  {" "}and{" "}
                  <span className="font-semibold text-green-600">
                    ₦{parseFloat(verifyStatus.ngnAmount).toLocaleString()}
                  </span>{" "}
                  has been credited to your account
                </>
              )}
              .
            </p>
            <Button onClick={resetFlow} variant="outline" className="rounded-xl">
              Make Another Deposit
            </Button>
          </motion.div>
        )}

        {/* Recent Deposits — only show entries that have actual transactions */}
        {(() => {
          const depositsWithTx = recentDeposits.filter(
            (d) => d.transactions && d.transactions.length > 0,
          );
          if (depositsWithTx.length === 0) return null;
          return (
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Recent Deposits
              </h3>
              <div className="space-y-2">
                {depositsWithTx.map((deposit) => {
                  const lastTx = deposit.transactions[0];
                  return (
                    <div
                      key={deposit.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
                    >
                      <div>
                        <p className="font-medium">
                          {lastTx.cryptoAmount} {deposit.asset}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {deposit.network} &bull;{" "}
                          {new Date(lastTx.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          {lastTx.status === "confirmed" &&
                          lastTx.ngnAmount &&
                          lastTx.ngnAmount !== "0"
                            ? `₦${parseFloat(lastTx.ngnAmount).toLocaleString()}`
                            : lastTx.status === "failed"
                              ? "Rejected"
                              : lastTx.status === "confirming" &&
                                  lastTx.confirmations
                                ? `${lastTx.confirmations} confs`
                                : "Scanning..."}
                        </p>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            lastTx.status === "confirmed"
                              ? "bg-green-500/10 text-green-500"
                              : lastTx.status === "failed"
                                ? "bg-red-500/10 text-red-500"
                                : lastTx.status === "confirming"
                                  ? "bg-blue-500/10 text-blue-500"
                                  : "bg-yellow-500/10 text-yellow-500"
                          }`}
                        >
                          {lastTx.status === "confirmed"
                            ? "Credited"
                            : lastTx.status === "failed"
                              ? "Failed"
                              : lastTx.status === "confirming"
                                ? "Confirming"
                                : "Scanning"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Security Notice */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/50 text-sm">
          <Shield className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="font-medium">Secure & Verified</p>
            <p className="text-muted-foreground text-xs mt-1">
              After you send crypto and confirm, Vura scans the blockchain for
              your transaction. Once verified, Naira is credited to your balance
              at the live rate (1% platform spread). Most deposits confirm
              within minutes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CryptoDeposit;
