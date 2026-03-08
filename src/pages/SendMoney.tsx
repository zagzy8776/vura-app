import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowUpRight, CheckCircle, AlertTriangle, Search, Building2, User, 
  ChevronDown, Check, QrCode, Clock, Calendar, Repeat, Share2, Star,
  History, Wallet, ArrowLeft, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";
import { SecurityCountdownModal } from "@/components/SecurityCountdownModal";
import { apiFetch } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

type BankOption = { code: string; name: string };
type BankOptionResponse = { code: string; name: string };

type TransferMode = "tag" | "bank";
type ScheduleType = "now" | "later" | "recurring";
type RecurringFrequency = "daily" | "weekly" | "monthly";

interface RecentRecipient {
  id: string;
  type: "tag" | "bank";
  name: string;
  identifier: string;
  bankCode?: string;
  bankName?: string;
  lastUsed: string;
  isFavorite: boolean;
}

// Default empty array - will be populated from API
const DEFAULT_RECIPIENTS: RecentRecipient[] = [];

const SendMoney = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [step, setStep] = useState<"form" | "confirm" | "success">("form");
  const [transferMode, setTransferMode] = useState<TransferMode>("tag");
  const [sendToBankAvailable, setSendToBankAvailable] = useState(false);
  const [transferAvailable, setTransferAvailable] = useState(false);
  const [userLimits, setUserLimits] = useState<{ dailyLimit: number; used: number; remaining: number }>({ dailyLimit: 50000, used: 0, remaining: 50000 });
  const [recentRecipients, setRecentRecipients] = useState<RecentRecipient[]>(DEFAULT_RECIPIENTS);
  const [showRecentList, setShowRecentList] = useState(false);
  const [recipientTag, setRecipientTag] = useState("");
  const [recipientData, setRecipientData] = useState<{ found: boolean; vuraTag: string; kycTier: number } | null>(null);
  const [lookingUpTag, setLookingUpTag] = useState(false);
  const [accountNumber, setAccountNumber] = useState("");
  const [selectedBank, setSelectedBank] = useState("");
  const [accountName, setAccountName] = useState("");
  const [verifyingAccount, setVerifyingAccount] = useState(false);
  const [accountVerified, setAccountVerified] = useState(false);
  const [showBankDropdown, setShowBankDropdown] = useState(false);
  const [showScheduleOptions, setShowScheduleOptions] = useState(false);
  const [scheduleType, setScheduleType] = useState<ScheduleType>("now");
  const [scheduleDate, setScheduleDate] = useState("");
  const [recurringFrequency, setRecurringFrequency] = useState<RecurringFrequency>("monthly");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);
  const [reference, setReference] = useState("");
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showAccountSuggestion, setShowAccountSuggestion] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);

  const [banks, setBanks] = useState<BankOption[]>([]);
  const [bankSearch, setBankSearch] = useState("");
  const [prefilledFromLink, setPrefilledFromLink] = useState(false);
  const [banksLoadError, setBanksLoadError] = useState(false);
  const [banksLoading, setBanksLoading] = useState(true);
  const [banksErrorMessage, setBanksErrorMessage] = useState<string | null>(null);
  const bankDropdownRef = useRef<HTMLDivElement>(null);
  const verifyRequestIdRef = useRef(0);
  const sendIdempotencyKeyRef = useRef<string | null>(null);

  const [feeBreakdown, setFeeBreakdown] = useState<
    | null
    | {
        fee: number;
        stampDuty: number;
        totalFee: number;
      }
  >(null);

  const flatBankFee = (amt: number) => (amt <= 5000 ? 10 : amt <= 50000 ? 25 : 50);
  const localFee = amount
    ? transferMode === 'tag'
      ? 0
      : flatBankFee(Number(amount))
    : 0;

  const fee =
    transferMode === "bank"
      ? (feeBreakdown ? feeBreakdown.totalFee : localFee)
      : 0;
  const total = Number(amount) + fee;
  const isOverLimit = Number(amount) + fee > userLimits.remaining;

  useEffect(() => {
    const lookupRecipient = async () => {
      if (recipientTag.length < 3) {
        setRecipientData(null);
        return;
      }
      setLookingUpTag(true);
      try {
        const tag = recipientTag.startsWith("@") ? recipientTag.slice(1) : recipientTag;
        const res = await apiFetch(`/transactions/lookup?tag=${encodeURIComponent(tag)}`);
        if (res.ok) {
          const data = await res.json();
          setRecipientData(data);
        }
      } catch (error) {
        console.error("Lookup failed:", error);
      } finally {
        setLookingUpTag(false);
      }
    };
    const debounce = setTimeout(lookupRecipient, 500);
    return () => clearTimeout(debounce);
  }, [recipientTag]);

  // Load real tier-based limits & today's usage from backend (source of truth)
  useEffect(() => {
    const loadLimits = async () => {
      try {
        // vura-backend: GET /limits
        const res = await apiFetch('/limits');
        if (!res.ok) return;
        const data = await res.json();

        // Backend returns string amounts with 2dp (e.g. "50000.00")
        const dailyLimit = Number(data?.dailySendLimit);
        const used = Number(data?.dailySent);
        const remaining = Number(data?.remainingDaily);
        if (
          Number.isFinite(dailyLimit) &&
          Number.isFinite(used) &&
          Number.isFinite(remaining)
        ) {
          setUserLimits({ dailyLimit, used, remaining });
        }
      } catch {
        // Keep safe fallback if API fails
      }
    };
    loadLimits();
  }, []);

  const loadBanks = async () => {
    setBanksLoadError(false);
    setBanksErrorMessage(null);
    setBanksLoading(true);
    try {
      const res = await apiFetch('/bank-codes/for-send-to-bank');
      const data = await res.json().catch(() => ({}));
      const ok = res.ok && data?.success === true && Array.isArray(data.banks);
      const available = ok && data.banks.length > 0;
      setSendToBankAvailable(!!available);
      setTransferAvailable(data?.transferAvailable === true);
      if (available) {
        const mapped: BankOption[] = (data.banks as BankOptionResponse[])
          .filter((b) => b?.code != null && b?.name)
          .map((b) => ({ code: String(b.code), name: String(b.name) }));
        setBanks(mapped.length > 0 ? mapped : []);
      } else {
        setBanks([]);
        if (data?.reason === 'vpay_error' && data?.message) setBanksErrorMessage(data.message);
        if (data?.reason === 'not_configured') setBanksErrorMessage('VPay is not configured on the server. Add VPAY_PUBLIC_KEY, VPAY_USERNAME, VPAY_PASSWORD and redeploy.');
        if (res.ok && data?.success === false) setBanksLoadError(true);
      }
    } catch (e) {
      setSendToBankAvailable(false);
      setTransferAvailable(false);
      setBanks([]);
      setBanksLoadError(true);
      setBanksErrorMessage(e instanceof Error ? e.message : 'Network error. Check your connection.');
    } finally {
      setBanksLoading(false);
    }
  };

  useEffect(() => {
    loadBanks();
  }, []);

  // Refetch banks when user switches to Bank tab (so API is called again if first load failed or env was just set)
  useEffect(() => {
    if (transferMode === 'bank') loadBanks();
  }, [transferMode]);

  // Prefill from payment link: /send?to=emeka&amount=5000&note=...
  useEffect(() => {
    const to = searchParams.get("to");
    const amt = searchParams.get("amount");
    const note = searchParams.get("note");
    if (to) {
      const tag = to.startsWith("@") ? to.slice(1) : to;
      setRecipientTag(tag);
      setTransferMode("tag");
    }
    if (amt && !isNaN(Number(amt))) setAmount(amt);
    if (note) setDescription(note);
    if (to || amt || note) {
      setPrefilledFromLink(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Load saved beneficiaries
  useEffect(() => {
    const loadBeneficiaries = async () => {
      try {
        const res = await apiFetch("/beneficiaries");
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data?.data) ? data.data : [];
        const mapped: RecentRecipient[] = list.map((b: { id: string; name: string; vuraTag?: string | null; accountNumber?: string | null; bankCode?: string | null; bankName?: string | null; type: string; isFavorite: boolean; createdAt: string }) => ({
          id: b.id,
          type: b.type === "bank" ? "bank" : "tag",
          name: b.name,
          identifier: b.type === "bank" ? (b.accountNumber || "") : (b.vuraTag || ""),
          bankCode: b.bankCode || undefined,
          bankName: b.bankName || undefined,
          lastUsed: b.createdAt,
          isFavorite: !!b.isFavorite,
        }));
        if (mapped.length > 0) setRecentRecipients(mapped);
      } catch {
        // keep default
      }
    };
    loadBeneficiaries();
  }, []);

  useEffect(() => {
    const cleanInput = recipientTag.replace(/\D/g, "");
    if (cleanInput.length === 10 && /^\d{10}$/.test(cleanInput)) {
      setShowAccountSuggestion(true);
    } else {
      setShowAccountSuggestion(false);
    }
  }, [recipientTag]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bankDropdownRef.current && !bankDropdownRef.current.contains(e.target as Node)) setShowBankDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const verifyBankAccount = async () => {
    if (accountNumber.length !== 10 || !selectedBank) return;
    const requestId = ++verifyRequestIdRef.current;
    setVerifyingAccount(true);
    try {
      const res = await apiFetch(`/transactions/verify-account?accountNumber=${accountNumber}&bankCode=${selectedBank}`);
      if (requestId !== verifyRequestIdRef.current) return;
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.accountName) {
        setAccountName(data.accountName);
        setAccountVerified(true);
        toast({ title: "Account verified", description: data.accountName });
      } else {
        setAccountName("");
        setAccountVerified(false);
        const msg = data?.message || "Could not verify account. Check number and bank.";
        toast({ title: "Verification failed", description: msg, variant: "destructive" });
      }
    } catch (error) {
      if (requestId !== verifyRequestIdRef.current) return;
      setAccountName("");
      setAccountVerified(false);
      toast({ title: "Verification failed", description: "Network error. Try again.", variant: "destructive" });
    } finally {
      if (requestId === verifyRequestIdRef.current) setVerifyingAccount(false);
    }
  };

  const fetchTransferFee = async () => {
    if (transferMode !== "bank") {
      setFeeBreakdown(null);
      return;
    }
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFeeBreakdown(null);
      return;
    }

    try {
      const res = await apiFetch(`/transactions/transfer-fee?amount=${parsed}`);
      if (!res.ok) {
        setFeeBreakdown(null);
        return;
      }
      const data = await res.json();
      if (data?.success) {
        setFeeBreakdown({
          fee: Number(data.fee || 0),
          stampDuty: Number(data.stampDuty || 0),
          totalFee: Number(data.totalFee || 0),
        });
      } else {
        setFeeBreakdown(null);
      }
    } catch {
      setFeeBreakdown(null);
    }
  };

  useEffect(() => {
    if (accountNumber.length !== 10 || !selectedBank) return;
    setAccountVerified(false);
    setAccountName("");
    const t = setTimeout(verifyBankAccount, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when account/bank change
  }, [accountNumber, selectedBank]);

  useEffect(() => {
    const debounce = setTimeout(fetchTransferFee, 500);
    return () => clearTimeout(debounce);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when amount/mode change
  }, [amount, transferMode]);

  const handleSecurityConfirm = () => {
    setShowSecurityModal(false);
    handleSend();
  };

  const handleSend = async () => {
    if (pin.length !== 6) {
      toast({ title: "Invalid PIN", description: "Enter your 6-digit PIN", variant: "destructive" });
      return;
    }
    if (scheduleType !== "now") {
      toast({ title: "Coming soon", description: "Scheduled and recurring transfers will be available soon. Use Send now for instant transfers.", variant: "default" });
      return;
    }
    setSending(true);
    try {
      let res;
      if (transferMode === "tag") {
        const tag = recipientTag.startsWith("@") ? recipientTag.slice(1) : recipientTag;
        res = await apiFetch("/transactions/send", {
          method: "POST",
          body: JSON.stringify({
            recipientTag: tag,
            amount: Number(amount),
            description,
            pin,
            scheduleType: "now",
          }),
        });
      } else {
        res = await apiFetch("/transactions/send-to-bank", {
          method: "POST",
          body: JSON.stringify({
            accountNumber,
            bankCode: selectedBank,
            accountName,
            amount: Number(amount),
            description,
            pin,
            scheduleType: "now",
            idempotencyKey: sendIdempotencyKeyRef.current || crypto.randomUUID(),
          }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || "Transfer failed. Please try again.");
      }
      setReference(data.reference || `VUR${Date.now()}`);
      const displayName = transferMode === "tag" ? `@${recipientData?.vuraTag || recipientTag}` : accountName;
      const newRecipient: RecentRecipient = {
        id: Date.now().toString(),
        type: transferMode,
        name: displayName,
        identifier: transferMode === "tag" ? (recipientTag.startsWith("@") ? recipientTag.slice(1) : recipientTag) : accountNumber,
        bankCode: selectedBank,
        bankName: banks.find(b => b.code === selectedBank)?.name,
        lastUsed: new Date().toISOString(),
        isFavorite: false,
      };
      setRecentRecipients(prev => [newRecipient, ...prev.filter(r => r.identifier !== newRecipient.identifier)].slice(0, 10));
      // Persist as beneficiary (ignore if already exists)
      try {
        if (transferMode === "tag") {
          await apiFetch("/beneficiaries", {
            method: "POST",
            body: JSON.stringify({
              name: displayName,
              vuraTag: newRecipient.identifier,
              type: "vura",
            }),
          });
        } else {
          await apiFetch("/beneficiaries", {
            method: "POST",
            body: JSON.stringify({
              name: accountName,
              accountNumber,
              bankCode: selectedBank,
              bankName: banks.find(b => b.code === selectedBank)?.name,
              type: "bank",
            }),
          });
        }
      } catch {
        // already exists or network; ignore
      }
      setStep("success");
      toast({ title: "Transfer successful", description: `You sent ₦${Number(amount).toLocaleString()} to ${getRecipientDisplay()}` });
    } catch (error: unknown) {
      let msg = "Transfer failed. Please try again.";
      if (error instanceof Error && error.message) msg = error.message;
      toast({ title: "Transfer failed", description: msg, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleShareReceipt = () => {
    const receiptText = `Vura Transfer Receipt\n\nTo: ${getRecipientDisplay()}\nAmount: ₦${Number(amount).toLocaleString()}\nFee: ₦${fee.toFixed(2)}\nTotal: ₦${total.toLocaleString()}\nRef: ${reference}\n\nSent via @vura`;
    if (navigator.share) {
      navigator.share({ title: "Vura Transfer Receipt", text: receiptText });
    } else {
      navigator.clipboard.writeText(receiptText);
      toast({ title: "Receipt Copied!", description: "Receipt details copied to clipboard" });
    }
  };

  const selectRecentRecipient = (recipient: RecentRecipient) => {
    if (recipient.type === "tag") {
      setTransferMode("tag");
      setRecipientTag(recipient.identifier);
    } else {
      setTransferMode("bank");
      setAccountNumber(recipient.identifier);
      setSelectedBank(recipient.bankCode || "");
      setTimeout(() => verifyBankAccount(), 100);
    }
    setShowRecentList(false);
  };

  const toggleFavorite = async (id: string) => {
    const current = recentRecipients.find(r => r.id === id);
    const newFavorite = !current?.isFavorite;
    setRecentRecipients(prev => prev.map(r => r.id === id ? { ...r, isFavorite: newFavorite } : r));
    try {
      const res = await apiFetch(`/beneficiaries/${id}`, {
        method: "PUT",
        body: JSON.stringify({ isFavorite: newFavorite }),
      });
      if (!res.ok) setRecentRecipients(prev => prev.map(r => r.id === id ? { ...r, isFavorite: current?.isFavorite ?? false } : r));
    } catch {
      setRecentRecipients(prev => prev.map(r => r.id === id ? { ...r, isFavorite: current?.isFavorite ?? false } : r));
    }
  };

  const selectedBankName = banks.find(b => b.code === selectedBank)?.name || "Select Bank";
  const favorites = recentRecipients.filter(r => r.isFavorite);
  const others = recentRecipients.filter(r => !r.isFavorite);

  const isFormValid = () => {
    if (!amount || Number(amount) <= 0) return false;
    if (isOverLimit) return false;
    if (transferMode === "tag") {
      return recipientData?.found;
    } else {
      return transferAvailable && accountNumber.length === 10 && selectedBank && accountVerified;
    }
  };

  const getRecipientDisplay = () => {
    if (transferMode === "tag") {
      return `@${recipientData?.vuraTag || recipientTag}`;
    } else {
      return `${accountName || accountNumber} - ${selectedBankName}`;
    }
  };

  const resetForm = () => {
    setStep("form");
    setRecipientTag("");
    setRecipientData(null);
    setAccountNumber("");
    setSelectedBank("");
    setAccountName("");
    setAccountVerified(false);
    setAmount("");
    setDescription("");
    setPin("");
    setScheduleType("now");
    setScheduleDate("");
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 lg:ml-64 px-4 sm:px-6 lg:px-8 py-6 pb-24">
        <DashboardHeader />
        <div className="max-w-lg mx-auto">
          {step === "form" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Send Money</h2>
                <p className="text-muted-foreground text-sm mt-1">Transfer funds instantly</p>
              </div>

              {prefilledFromLink && recipientTag && amount && (
                <div className="rounded-xl bg-primary/10 border border-primary/20 p-3 text-sm text-foreground">
                  <span className="font-medium">Paying @{recipientTag.startsWith("@") ? recipientTag.slice(1) : recipientTag} ₦{Number(amount).toLocaleString()}</span>
                </div>
              )}

              <div className="rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">Daily Limit</span>
                  <span className="text-sm text-muted-foreground">₦{userLimits.remaining.toLocaleString()} / ₦{userLimits.dailyLimit.toLocaleString()}</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(userLimits.used / userLimits.dailyLimit) * 100}%` }} />
                </div>
                {isOverLimit && <p className="text-xs text-destructive mt-2">⚠️ Amount exceeds remaining limit</p>}
              </div>

              <div className="rounded-2xl bg-card border border-border p-1 shadow-card">
                <div className="flex gap-1">
                  <button onClick={() => setTransferMode("tag")} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-medium transition-all ${transferMode === "tag" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    <User className="h-4 w-4" /> @tag
                  </button>
                  <button onClick={() => setTransferMode("bank")} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-medium transition-all ${transferMode === "bank" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    <Building2 className="h-4 w-4" /> Bank
                  </button>
                  <button onClick={() => setShowQRScanner(true)} className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground transition-all">
                    <QrCode className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {(favorites.length > 0 || others.length > 0) && (
                <div className="space-y-3">
                  <button onClick={() => setShowRecentList(!showRecentList)} className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors">
                    <History className="h-4 w-4" /> Recent & Favorites <ChevronDown className={`h-4 w-4 transition-transform ${showRecentList ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence>
                    {showRecentList && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="grid grid-cols-4 gap-2">
                        {favorites.map((recipient) => (
                          <button key={recipient.id} onClick={() => selectRecentRecipient(recipient)} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-200 text-amber-700 font-bold text-sm">{recipient.name.slice(0, 2).toUpperCase()}</div>
                            <span className="text-xs font-medium text-foreground truncate w-full text-center">{recipient.name}</span>
                            <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                          </button>
                        ))}
                        {others.slice(0, 4 - favorites.length).map((recipient) => (
                          <button key={recipient.id} onClick={() => selectRecentRecipient(recipient)} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-card border border-border hover:bg-secondary transition-colors">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground font-bold text-sm">{recipient.name.slice(0, 2).toUpperCase()}</div>
                            <span className="text-xs font-medium text-foreground truncate w-full text-center">{recipient.name}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              <div className="rounded-2xl bg-card border border-border p-4 sm:p-6 shadow-card space-y-5">
                <AnimatePresence mode="wait">
                  {transferMode === "tag" ? (
                    <motion.div key="tag" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-5">
                      <div>
                        <Label className="text-sm font-medium text-foreground mb-1.5 block">Recipient @tag</Label>
                        <div className="relative">
                          <Input placeholder="@emeka" value={recipientTag} onChange={(e) => setRecipientTag(e.target.value.replace(/[^@a-zA-Z0-9_]/g, "").toLowerCase())} className="h-12 rounded-xl" />
                          {lookingUpTag && <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-pulse" />}
                        </div>
                        {showAccountSuggestion && (
                          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                            <p className="text-sm text-amber-700">This looks like a bank account number</p>
                            <button onClick={() => { setAccountNumber(recipientTag.replace(/\D/g, "")); setTransferMode("bank"); setShowAccountSuggestion(false); }} className="text-sm text-primary font-medium mt-1 hover:underline">Switch to bank transfer →</button>
                          </motion.div>
                        )}
                        {recipientData && <div className={`mt-2 p-2 rounded-lg text-sm ${recipientData.found ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>{recipientData.found ? `✓ @${recipientData.vuraTag} found (Tier ${recipientData.kycTier})` : "User not found"}</div>}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="bank" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
                      {banksLoading && (
                        <div className="rounded-xl bg-muted/50 border border-border p-5 flex items-center justify-center gap-3">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground shrink-0" />
                          <p className="text-sm text-muted-foreground">Loading banks…</p>
                        </div>
                      )}
                      {!banksLoading && !sendToBankAvailable && (
                        <div className="rounded-xl bg-muted/50 border border-border p-4 space-y-3">
                          <p className="text-sm text-foreground">Bank transfer is temporarily unavailable. You can send to any Vura user with <strong>@tag</strong> above, or try again in a moment.</p>
                          {banksErrorMessage && <p className="text-xs text-muted-foreground">{banksErrorMessage}</p>}
                          <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={loadBanks}>Try again</Button>
                        </div>
                      )}
                      {!banksLoading && sendToBankAvailable && (
                        <>
                      <div>
                        <Label className="text-sm font-medium text-foreground mb-1.5 block">Bank</Label>
                        <div className="relative" ref={bankDropdownRef}>
                          <button type="button" onClick={() => setShowBankDropdown(!showBankDropdown)} className="w-full h-12 px-4 rounded-xl border border-input bg-background text-left flex items-center justify-between hover:bg-accent transition-colors">
                            <span className={selectedBank ? "text-foreground" : "text-muted-foreground"}>{selectedBankName}</span>
                            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showBankDropdown ? "rotate-180" : ""}`} />
                          </button>
                          {showBankDropdown && (
                            <div className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-card shadow-lg z-50">
                              <div className="p-2">
                                <Input
                                  placeholder="Search bank..."
                                  value={bankSearch}
                                  onChange={(e) => setBankSearch(e.target.value)}
                                  className="h-10 rounded-lg"
                                />
                              </div>
                              {banks
                                .filter((bank) =>
                                  bank.name
                                    .toLowerCase()
                                    .includes(bankSearch.toLowerCase()),
                                )
                                .map((bank) => (
                                <button key={bank.code} onClick={() => { setSelectedBank(bank.code); setShowBankDropdown(false); setAccountVerified(false); }} className={`w-full px-4 py-3 text-left hover:bg-secondary transition-colors ${selectedBank === bank.code ? "bg-primary/10" : ""}`}>
                                  <span className="text-sm">{bank.name}</span>
                                  {selectedBank === bank.code && <Check className="h-4 w-4 text-primary ml-auto" />}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-foreground mb-1.5 block">Account Number</Label>
                        <Input placeholder="10-digit account number" value={accountNumber} onChange={(e) => { setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10)); setAccountVerified(false); }} className="h-12 rounded-xl" maxLength={10} />
                        {accountNumber.length === 10 && !accountVerified && !verifyingAccount && <p className="text-xs text-muted-foreground mt-1">Verifying account...</p>}
                        {verifyingAccount && <p className="text-xs text-muted-foreground mt-1">Verifying...</p>}
                        {accountVerified && accountName && <div className="mt-2 p-2 rounded-lg bg-green-50 text-green-700 text-sm">✓ {accountName}</div>}
                      </div>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div>
                  <Label className="text-sm font-medium text-foreground mb-1.5 block">Amount (₦)</Label>
                  <Input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-14 rounded-xl text-2xl font-bold" />
                </div>

                <div>
                  <Label className="text-sm font-medium text-foreground mb-1.5 block">Description (optional)</Label>
                  <Input placeholder="What's this for?" value={description} onChange={(e) => setDescription(e.target.value)} className="h-12 rounded-xl" />
                </div>

                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> Send now. Scheduled & recurring transfers coming later.
                  </p>
                </div>

                {amount && Number(amount) > 0 && (
                  <div className="rounded-xl bg-secondary p-4 space-y-2 text-sm">
                    {transferMode === "bank" && feeBreakdown ? (
                      <>
                        <div className="flex justify-between text-muted-foreground">
                          <span>Provider fee</span>
                          <span>₦{feeBreakdown.fee.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>Stamp duty</span>
                          <span>₦{feeBreakdown.stampDuty.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                          <span>Total fees</span>
                          <span>₦{feeBreakdown.totalFee.toFixed(2)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between text-muted-foreground"><span>Transfer fee</span><span>₦{fee.toFixed(2)}</span></div>
                    )}
                    {scheduleType !== "now" && <div className="flex justify-between text-amber-600"><span>{scheduleType === "later" ? "Scheduled" : "Recurring"}</span><span>{scheduleType === "later" ? scheduleDate : recurringFrequency}</span></div>}
                    <div className="flex justify-between font-semibold text-foreground"><span>Total</span><span>₦{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                  </div>
                )}

                <Button onClick={() => { if (transferMode === "bank") sendIdempotencyKeyRef.current = crypto.randomUUID(); setStep("confirm"); }} disabled={!isFormValid()} className="w-full h-12 rounded-xl gradient-brand text-primary-foreground font-semibold border-0 hover:opacity-90">Continue</Button>
              </div>
            </motion.div>
          )}

          {step === "confirm" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="flex items-center gap-3">
                <button onClick={() => setStep("form")} className="p-2 rounded-lg hover:bg-secondary transition-colors">
                  <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                </button>
                <h2 className="text-2xl font-bold text-foreground">Confirm Transfer</h2>
              </div>
              <div className="rounded-2xl bg-card border border-border p-6 shadow-card space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-xl bg-secondary">
                  <AlertTriangle className="h-5 w-5 text-accent" />
                  <p className="text-sm text-muted-foreground">Please verify the recipient details before confirming.</p>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Transfer Type</span><span className="font-medium text-foreground flex items-center gap-1">{transferMode === "tag" ? <User className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}{transferMode === "tag" ? "Vura @tag" : "Bank Transfer"}</span></div>
                  {scheduleType !== "now" && <div className="flex justify-between"><span className="text-muted-foreground">Schedule</span><span className="font-medium text-amber-600">{scheduleType === "later" ? scheduleDate : `Every ${recurringFrequency}`}</span></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">To</span><span className="font-medium text-foreground text-right max-w-[60%] truncate">{getRecipientDisplay()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-medium text-foreground">₦{Number(amount).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Fee</span><span className="font-medium text-foreground">₦{fee.toFixed(2)}</span></div>
                  <hr className="border-border" />
                  <div className="flex justify-between text-base"><span className="font-semibold text-foreground">Total</span><span className="font-bold text-foreground">₦{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-foreground">Enter 6-digit PIN</Label>
                  <Input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••••" className="h-12 rounded-xl text-center text-2xl tracking-widest" />
                </div>
                <Button onClick={() => setShowSecurityModal(true)} disabled={sending || pin.length !== 6} className="w-full h-12 rounded-xl gradient-brand text-primary-foreground font-semibold border-0 hover:opacity-90">
                  {sending ? "Processing..." : `Send ₦${Number(amount).toLocaleString()}`}
                </Button>
              </div>
            </motion.div>
          )}

          {/* Security Countdown Modal */}
          <SecurityCountdownModal
            isOpen={showSecurityModal}
            onClose={() => setShowSecurityModal(false)}
            onConfirm={handleSecurityConfirm}
            transferMode={transferMode}
            recipientName={transferMode === "tag" ? recipientData?.vuraTag || recipientTag : accountName}
            recipientTag={transferMode === "tag" ? recipientTag : accountNumber}
            bankName={transferMode === 'bank' ? selectedBankName : undefined}
            amount={Number(amount)}
            currency="NGN"
            countdownSeconds={10}
          />

          {step === "success" && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6 text-center">
              <div className="py-12">
                <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
                  <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">Transfer successful</h2>
                <p className="text-muted-foreground mb-6">
                  You sent ₦{Number(amount).toLocaleString()} to {getRecipientDisplay()}
                </p>
                <div className="rounded-2xl bg-card border border-border p-6 shadow-card max-w-sm mx-auto mb-6">
                  <div className="space-y-2 text-sm text-left">
                    <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span className="font-medium text-foreground">{reference}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-medium text-foreground">₦{Number(amount).toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Fee</span><span className="font-medium text-foreground">₦{fee.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-bold text-foreground">₦{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                  </div>
                </div>
                <div className="flex gap-3 justify-center">
                  <Button onClick={handleShareReceipt} variant="outline" className="rounded-xl">
                    <Share2 className="h-4 w-4 mr-2" /> Share Receipt
                  </Button>
                  <Button onClick={resetForm} className="rounded-xl gradient-brand text-primary-foreground border-0 hover:opacity-90">
                    Send Another
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
};

export default SendMoney;
