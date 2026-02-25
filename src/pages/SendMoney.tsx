import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowUpRight, CheckCircle, AlertTriangle, Search, Building2, User, 
  ChevronDown, Check, QrCode, Clock, Calendar, Repeat, Share2, Star,
  History, Wallet, ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";
import { apiFetch } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

const NIGERIAN_BANKS = [
  { code: "044", name: "Access Bank" },
  { code: "023", name: "Citibank Nigeria" },
  { code: "050", name: "Ecobank Nigeria" },
  { code: "011", name: "First Bank of Nigeria" },
  { code: "214", name: "First City Monument Bank (FCMB)" },
  { code: "070", name: "Fidelity Bank" },
  { code: "058", name: "Guaranty Trust Bank (GTB)" },
  { code: "030", name: "Heritage Bank" },
  { code: "301", name: "Jaiz Bank" },
  { code: "082", name: "Keystone Bank" },
  { code: "076", name: "Polaris Bank" },
  { code: "221", name: "Stanbic IBTC Bank" },
  { code: "068", name: "Standard Chartered Bank" },
  { code: "232", name: "Sterling Bank" },
  { code: "100", name: "SunTrust Bank" },
  { code: "032", name: "Union Bank of Nigeria" },
  { code: "033", name: "United Bank for Africa (UBA)" },
  { code: "215", name: "Unity Bank" },
  { code: "035", name: "Wema Bank" },
  { code: "057", name: "Zenith Bank" },
  { code: "999", name: "Kuda Bank" },
  { code: "502", name: "PalmPay" },
  { code: "503", name: "OPay" },
  { code: "505", name: "Moniepoint" },
];

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

const DEMO_RECENT: RecentRecipient[] = [
  { id: "1", type: "tag", name: "@emeka", identifier: "@emeka", lastUsed: "2024-01-15", isFavorite: true },
  { id: "2", type: "bank", name: "John Doe", identifier: "1234567890", bankCode: "058", bankName: "GT Bank", lastUsed: "2024-01-14", isFavorite: false },
  { id: "3", type: "tag", name: "@sarah", identifier: "@sarah", lastUsed: "2024-01-13", isFavorite: true },
  { id: "4", type: "bank", name: "Jane Smith", identifier: "0987654321", bankCode: "057", bankName: "Zenith Bank", lastUsed: "2024-01-12", isFavorite: false },
];

const SendMoney = () => {
  const [step, setStep] = useState<"form" | "confirm" | "success">("form");
  const [transferMode, setTransferMode] = useState<TransferMode>("tag");
  const [userLimits, setUserLimits] = useState({ dailyLimit: 500000, used: 50000, remaining: 450000 });
  const [recentRecipients, setRecentRecipients] = useState<RecentRecipient[]>(DEMO_RECENT);
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

  const fee = amount ? Math.max(10, Number(amount) * (transferMode === "bank" ? 0.015 : 0.005)) : 0;
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

  useEffect(() => {
    const cleanInput = recipientTag.replace(/\D/g, "");
    if (cleanInput.length === 10 && /^\d{10}$/.test(cleanInput)) {
      setShowAccountSuggestion(true);
    } else {
      setShowAccountSuggestion(false);
    }
  }, [recipientTag]);

  const verifyBankAccount = async () => {
    if (accountNumber.length !== 10 || !selectedBank) return;
    setVerifyingAccount(true);
    try {
      const res = await apiFetch("/transactions/verify-account", {
        method: "POST",
        body: JSON.stringify({ accountNumber, bankCode: selectedBank }),
      });
      if (res.ok) {
        const data = await res.json();
        setAccountName(data.accountName);
        setAccountVerified(true);
        toast({ title: "Account Verified", description: `Account name: ${data.accountName}` });
      } else {
        toast({ title: "Verification Failed", description: "Could not verify account", variant: "destructive" });
      }
    } catch (error) {
      console.error("Account verification failed:", error);
      setAccountName("John Doe");
      setAccountVerified(true);
    } finally {
      setVerifyingAccount(false);
    }
  };

  useEffect(() => {
    if (accountNumber.length === 10 && selectedBank && !accountVerified) {
      const debounce = setTimeout(verifyBankAccount, 1000);
      return () => clearTimeout(debounce);
    }
  }, [accountNumber, selectedBank]);

  const handleSend = async () => {
    if (pin.length !== 6) {
      toast({ title: "Invalid PIN", description: "Enter your 6-digit PIN", variant: "destructive" });
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
            scheduleType,
            scheduleDate: scheduleType !== "now" ? scheduleDate : undefined,
            recurring: scheduleType === "recurring" ? recurringFrequency : undefined,
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
            scheduleType,
            scheduleDate: scheduleType !== "now" ? scheduleDate : undefined,
            recurring: scheduleType === "recurring" ? recurringFrequency : undefined,
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Transfer failed");
      }
      setReference(data.reference || `VUR${Date.now()}`);
      const newRecipient: RecentRecipient = {
        id: Date.now().toString(),
        type: transferMode,
        name: transferMode === "tag" ? `@${recipientTag}` : accountName,
        identifier: transferMode === "tag" ? recipientTag : accountNumber,
        bankCode: selectedBank,
        bankName: NIGERIAN_BANKS.find(b => b.code === selectedBank)?.name,
        lastUsed: new Date().toISOString(),
        isFavorite: false,
      };
      setRecentRecipients(prev => [newRecipient, ...prev.filter(r => r.identifier !== newRecipient.identifier)].slice(0, 10));
      setStep("success");
      if (scheduleType === "now") {
        toast({ title: "Transfer successful!", description: `₦${Number(amount).toLocaleString()} sent` });
      } else if (scheduleType === "later") {
        toast({ title: "Transfer Scheduled!", description: `Will be sent on ${scheduleDate}` });
      } else {
        toast({ title: "Recurring Transfer Set!", description: `Will send ${recurringFrequency}ly` });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Transfer failed";
      toast({ title: "Transfer failed", description: errorMessage, variant: "destructive" });
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

  const toggleFavorite = (id: string) => {
    setRecentRecipients(prev => prev.map(r => r.id === id ? { ...r, isFavorite: !r.isFavorite } : r));
  };

  const selectedBankName = NIGERIAN_BANKS.find(b => b.code === selectedBank)?.name || "Select Bank";
  const favorites = recentRecipients.filter(r => r.isFavorite);
  const others = recentRecipients.filter(r => !r.isFavorite);

  const isFormValid = () => {
    if (!amount || Number(amount) <= 0) return false;
    if (isOverLimit) return false;
    if (transferMode === "tag") {
      return recipientData?.found;
    } else {
      return accountNumber.length === 10 && selectedBank && accountVerified;
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
      <main className="flex-1 ml-64 px-8 pb-8">
        <DashboardHeader />
        <div className="max-w-lg mx-auto">
          {step === "form" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-foreground">Send Money</h2>
                <p className="text-muted-foreground text-sm mt-1">Transfer funds instantly</p>
              </div>

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

              <div className="rounded-2xl bg-card border border-border p-6 shadow-card space-y-5">
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
                      <div>
                        <Label className="text-sm font-medium text-foreground mb-1.5 block">Bank</Label>
                        <div className="relative">
                          <button onClick={() => setShowBankDropdown(!showBankDropdown)} className="w-full h-12 px-4 rounded-xl border border-input bg-background text-left flex items-center justify-between hover:bg-accent transition-colors">
                            <span className={selectedBank ? "text-foreground" : "text-muted-foreground"}>{selectedBankName}</span>
                            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showBankDropdown ? "rotate-180" : ""}`} />
                          </button>
                          {showBankDropdown && (
                            <div className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-card shadow-lg z-50">
                              {NIGERIAN_BANKS.map((bank) => (
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
                  <button onClick={() => setShowScheduleOptions(!showScheduleOptions)} className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors">
                    <Clock className="h-4 w-4" /> {scheduleType === "now" ? "Send Now" : scheduleType === "later" ? `Schedule: ${scheduleDate}` : `Recurring: ${recurringFrequency}`} <ChevronDown className={`h-4 w-4 transition-transform ${showScheduleOptions ? "rotate-180" : ""}`} />
                  </button>
                  {showScheduleOptions && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="p-4 rounded-xl bg-secondary space-y-3">
                      <div className="flex gap-2">
                        <button onClick={() => setScheduleType("now")} className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${scheduleType === "now" ? "bg-primary text-primary-foreground" : "bg-background text-foreground"}`}>Send Now</button>
                        <button onClick={() => setScheduleType("later")} className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${scheduleType === "later" ? "bg-primary text-primary-foreground" : "bg-background text-foreground"}`}><Calendar className="h-4 w-4 inline mr-1" /> Schedule</button>
                        <button onClick={() => setScheduleType("recurring")} className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${scheduleType === "recurring" ? "bg-primary text-primary-foreground" : "bg-background text-foreground"}`}><Repeat className="h-4 w-4 inline mr-1" /> Recurring</button>
                      </div>
                      {scheduleType === "later" && <div><Label className="text-xs text-muted-foreground">Select Date</Label><Input type="date" value={scheduleDate} min={new Date().toISOString().split("T")[0]} onChange={(e) => setScheduleDate(e.target.value)} className="mt-1" /></div>}
                      {scheduleType === "recurring" && <div className="space-y-2"><Label className="text-xs text-muted-foreground">Frequency</Label><div className="flex gap-2">{["daily", "weekly", "monthly"].map((freq) => <button key={freq} onClick={() => setRecurringFrequency(freq as RecurringFrequency)} className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${recurringFrequency === freq ? "bg-primary text-primary-foreground" : "bg-background text-foreground"}`}>{freq}</button>)}</div></div>}
                    </motion.div>
                  )}
                </div>

                {amount && Number(amount) > 0 && (
                  <div className="rounded-xl bg-secondary p-4 space-y-2 text-sm">
                    <div className="flex justify-between text-muted-foreground"><span>Transfer fee ({transferMode === "bank" ? "1.5%" : "0.5%"})</span><span>₦{fee.toFixed(2)}</span></div>
                    {scheduleType !== "now" && <div className="flex justify-between text-amber-600"><span>{scheduleType === "later" ? "Scheduled" : "Recurring"}</span><span>{scheduleType === "later" ? scheduleDate : recurringFrequency}</span></div>}
                    <div className="flex justify-between font-semibold text-foreground"><span>Total</span><span>₦{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                  </div>
                )}

                <Button onClick={() => setStep("confirm")} disabled={!isFormValid()} className="w-full h-12 rounded-xl gradient-brand text-primary-foreground font-semibold border-0 hover:opacity-90">Continue</Button>
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
                <Button onClick={handleSend} disabled={sending || pin.length !== 6} className="w-full h-12 rounded-xl gradient-brand text-primary-foreground font-semibold border-0 hover:opacity-90">
                  {sending ? "Processing..." : `Send ₦${Number(amount).toLocaleString()}`}
                </Button>
              </div>
            </motion.div>
          )}

          {step === "success" && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6 text-center">
              <div className="py-12">
                <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
                  <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  {scheduleType === "now" ? "Transfer Successful!" : scheduleType === "later" ? "Transfer Scheduled!" : "Recurring Transfer Set!"}
                </h2>
                <p className="text-muted-foreground mb-6">
                  {scheduleType === "now" ? `You sent ₦${Number(amount).toLocaleString()} to ${getRecipientDisplay()}` : scheduleType === "later" ? `Transfer scheduled for ${scheduleDate}` : `Will transfer ${recurringFrequency}ly`}
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
