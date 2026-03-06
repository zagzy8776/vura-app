import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Wallet, CheckCircle, Loader2, CreditCard, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";

const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000, 20000];

const FundWallet = () => {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [funded, setFunded] = useState(false);
  const [fundedAmount, setFundedAmount] = useState(0);
  const [balance, setBalance] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const refParam = searchParams.get("ref");

  useEffect(() => {
    const loadBalance = async () => {
      try {
        const res = await apiFetch("/transactions/balance");
        if (!res.ok) return;
        const json = await res.json();
        const ngn = Array.isArray(json)
          ? json.find((b: { currency: string }) => b.currency === "NGN")?.amount
          : json.data?.NGN ?? json.data?.ngn;
        setBalance(ngn != null ? String(ngn) : null);
      } catch {
        /* silent */
      }
    };
    loadBalance();
  }, [funded]);

  useEffect(() => {
    if (refParam) {
      verifyPayment(refParam);
    }
  }, [refParam]);

  const verifyPayment = async (ref: string) => {
    setVerifying(true);
    try {
      const res = await apiFetch(`/funding/verify?reference=${encodeURIComponent(ref)}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setFunded(true);
        setFundedAmount(json.data?.amount ?? 0);
        toast({ title: "Wallet funded!", description: json.message });
      } else {
        toast({ title: "Verification failed", description: json.message || "Payment not confirmed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not verify payment", variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  };

  const parsedAmount = parseFloat(amount) || 0;
  const fee = parsedAmount <= 2500 ? Math.ceil(parsedAmount * 0.015) : Math.min(Math.ceil(parsedAmount * 0.015), 2000);
  const total = parsedAmount + fee;
  const canProceed = parsedAmount >= 100 && parsedAmount <= 10000000;

  const handleFund = async () => {
    if (!canProceed) return;
    setLoading(true);
    try {
      const res = await apiFetch("/funding/initialize", {
        method: "POST",
        body: JSON.stringify({ amount: parsedAmount }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Could not start payment");
      }
      window.location.href = json.data.authorizationUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Verifying your payment...</p>
        </div>
      </div>
    );
  }

  if (funded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold">Wallet Funded!</h2>
          <p className="text-muted-foreground">
            ₦{fundedAmount.toLocaleString()} has been added to your wallet.
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => navigate("/")} className="rounded-xl gradient-brand text-primary-foreground font-semibold">
              <Wallet className="h-4 w-4 mr-2" /> Go to Wallet
            </Button>
            <Button onClick={() => { setFunded(false); setAmount(""); }} variant="outline" className="rounded-xl">
              Fund Again
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-4 px-4 py-4 max-w-lg mx-auto">
          <button onClick={() => navigate("/")} className="p-2 hover:bg-muted rounded-full transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold">Fund Wallet</h1>
            <p className="text-xs text-muted-foreground">Add money via card or bank transfer</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-6 pb-24">
        {balance !== null && (
          <div className="rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 p-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Current Balance</span>
            </div>
            <p className="text-2xl font-bold mt-1">₦{parseFloat(balance).toLocaleString()}</p>
          </div>
        )}

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-card border border-border p-6 shadow-card space-y-5">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-primary" />
            <p className="text-sm font-medium">Pay with card or bank transfer</p>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Amount (₦)</label>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-14 rounded-xl text-2xl font-bold"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((qa) => (
              <button
                key={qa}
                onClick={() => setAmount(qa.toString())}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  parsedAmount === qa ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"
                }`}
              >
                ₦{qa.toLocaleString()}
              </button>
            ))}
          </div>

          {parsedAmount > 0 && (
            <div className="rounded-xl bg-secondary p-4 space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Amount</span>
                <span>₦{parsedAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Processing fee (1.5%)</span>
                <span>₦{fee.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-semibold text-foreground">
                <span>You'll pay</span>
                <span>₦{total.toLocaleString()}</span>
              </div>
            </div>
          )}

          {parsedAmount > 0 && parsedAmount < 100 && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="h-3 w-3" /> Minimum amount is ₦100
            </div>
          )}

          <Button
            onClick={handleFund}
            disabled={!canProceed || loading}
            className="w-full h-12 rounded-xl gradient-brand text-primary-foreground font-semibold border-0 hover:opacity-90"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : `Fund ₦${parsedAmount > 0 ? parsedAmount.toLocaleString() : "0"}`}
          </Button>

          <p className="text-[11px] text-center text-muted-foreground">
            Secured by Paystack. Your card details are never stored.
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default FundWallet;
