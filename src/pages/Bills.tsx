import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Smartphone,
  Wifi,
  Wallet,
  Loader2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";

// ── Types ─────────────────────────────────────────────────────────────

interface Network {
  id: string;
  name: string;
  [key: string]: any;
}

interface DataPlan {
  plan_code: string;
  name: string;
  price: number;
  [key: string]: any;
}

interface ElectricityItem {
  item_code: string;
  biller_code: string;
  name: string;
  amount: number;
  fee: number;
}

// ── Constants ─────────────────────────────────────────────────────────

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

const NETWORK_COLORS: Record<string, string> = {
  mtn: "border-yellow-500 bg-yellow-500/10 text-yellow-600",
  glo: "border-green-600 bg-green-600/10 text-green-700",
  airtel: "border-red-500 bg-red-500/10 text-red-600",
  "9mobile": "border-green-500 bg-green-500/10 text-green-600",
};

function getNetworkStyle(nameOrId: string): string {
  const lower = nameOrId.toLowerCase();
  for (const key of Object.keys(NETWORK_COLORS)) {
    if (lower.includes(key)) return NETWORK_COLORS[key];
  }
  return "border-border bg-card text-foreground";
}

// ── Component ─────────────────────────────────────────────────────────

type BillTab = "airtime" | "data" | "electricity";

const Bills = () => {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab: BillTab =
    tabParam === "data"
      ? "data"
      : tabParam === "electricity"
        ? "electricity"
        : "airtime";

  const [tab, setTab] = useState<BillTab>(initialTab);
  const [step, setStep] = useState<"form" | "confirm" | "success" | "error">("form");

  // Shared
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [purchaseResult, setPurchaseResult] = useState<any>(null);

  // Airtime
  const [airtimeAmount, setAirtimeAmount] = useState("");
  const [airtimeNetworks, setAirtimeNetworks] = useState<Network[]>([]);
  const [airtimeNetworksLoading, setAirtimeNetworksLoading] = useState(true);

  // Data
  const [dataNetworks, setDataNetworks] = useState<Network[]>([]);
  const [dataNetworksLoading, setDataNetworksLoading] = useState(true);
  const [dataPlans, setDataPlans] = useState<DataPlan[]>([]);
  const [dataPlansLoading, setDataPlansLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<DataPlan | null>(null);

  // Electricity
  const [discos, setDiscos] = useState<Network[]>([]);
  const [discosLoading, setDiscosLoading] = useState(true);
  const [selectedDisco, setSelectedDisco] = useState<string>("");
  const [electricityItems, setElectricityItems] = useState<ElectricityItem[]>([]);
  const [electricityItemsLoading, setElectricityItemsLoading] = useState(false);
  const [selectedElectricityItem, setSelectedElectricityItem] = useState<ElectricityItem | null>(null);
  const [meterNumber, setMeterNumber] = useState("");
  const [meterValidated, setMeterValidated] = useState(false);
  const [meterCustomerName, setMeterCustomerName] = useState<string>("");
  const [electricityAmount, setElectricityAmount] = useState("");
  const [validatingMeter, setValidatingMeter] = useState(false);

  // Balance
  const [balance, setBalance] = useState<string | null>(null);

  const navigate = useNavigate();

  // ── Fetch networks on mount ─────────────────────────────────────────

  const fetchAirtimeNetworks = useCallback(async () => {
    setAirtimeNetworksLoading(true);
    try {
      const res = await apiFetch("/bills/airtime/networks");
      if (!res.ok) return;
      const json = await res.json();
      setAirtimeNetworks(json.data ?? []);
    } catch {
      // silent
    } finally {
      setAirtimeNetworksLoading(false);
    }
  }, []);

  const fetchDataNetworks = useCallback(async () => {
    setDataNetworksLoading(true);
    try {
      const res = await apiFetch("/bills/data/networks");
      if (!res.ok) return;
      const json = await res.json();
      setDataNetworks(json.data ?? []);
    } catch {
      // silent
    } finally {
      setDataNetworksLoading(false);
    }
  }, []);

  const fetchElectricityDiscos = useCallback(async () => {
    setDiscosLoading(true);
    try {
      const res = await apiFetch("/bills/electricity/discos");
      if (!res.ok) return;
      const json = await res.json();
      setDiscos(json.data ?? []);
    } catch {
      // silent
    } finally {
      setDiscosLoading(false);
    }
  }, []);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await apiFetch("/user/balance");
      if (!res.ok) return;
      const json = await res.json();
      setBalance(json.data?.NGN ?? json.data?.ngn ?? null);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchAirtimeNetworks();
    fetchDataNetworks();
    fetchElectricityDiscos();
    fetchBalance();
  }, [fetchAirtimeNetworks, fetchDataNetworks, fetchElectricityDiscos, fetchBalance]);

  // ── Fetch data plans when network changes ───────────────────────────

  useEffect(() => {
    if (tab !== "data" || !selectedNetwork) {
      setDataPlans([]);
      setSelectedPlan(null);
      return;
    }

    let cancelled = false;
    setDataPlansLoading(true);
    setSelectedPlan(null);

    (async () => {
      try {
        const res = await apiFetch(`/bills/data/plans?network=${selectedNetwork}`);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        setDataPlans(json.data ?? []);
      } catch {
        setDataPlans([]);
      } finally {
        if (!cancelled) setDataPlansLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [tab, selectedNetwork]);

  // ── Fetch electricity items when disco changes ────────────────────────
  useEffect(() => {
    if (tab !== "electricity" || !selectedDisco) {
      setElectricityItems([]);
      setSelectedElectricityItem(null);
      return;
    }
    let cancelled = false;
    setElectricityItemsLoading(true);
    setSelectedElectricityItem(null);
    (async () => {
      try {
        const res = await apiFetch(`/bills/electricity/items?disco=${selectedDisco}`);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        setElectricityItems(json.data ?? []);
      } catch {
        setElectricityItems([]);
      } finally {
        if (!cancelled) setElectricityItemsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, selectedDisco]);

  // ── Handlers ────────────────────────────────────────────────────────

  const resetForm = () => {
    setStep("form");
    setPhoneNumber("");
    setSelectedNetwork("");
    setAirtimeAmount("");
    setSelectedPlan(null);
    setPurchaseResult(null);
    setSelectedDisco("");
    setSelectedElectricityItem(null);
    setMeterNumber("");
    setMeterValidated(false);
    setMeterCustomerName("");
    setElectricityAmount("");
  };

  const switchTab = (newTab: BillTab) => {
    setTab(newTab);
    resetForm();
  };

  const canConfirmAirtime =
    selectedNetwork && phoneNumber.length >= 11 && parseFloat(airtimeAmount) >= 50;

  const canConfirmData =
    selectedNetwork && phoneNumber.length >= 11 && selectedPlan;

  const canConfirmElectricity =
    selectedDisco &&
    selectedElectricityItem &&
    meterNumber.length >= 6 &&
    meterValidated &&
    parseFloat(electricityAmount) >= 500;

  const currentAmount =
    tab === "airtime"
      ? parseFloat(airtimeAmount) || 0
      : tab === "data"
        ? selectedPlan?.price ?? 0
        : parseFloat(electricityAmount) || 0;

  const electricityTotal = tab === "electricity" ? currentAmount + 100 : 0; // ₦100 fee

  const handleValidateMeter = async () => {
    if (!selectedElectricityItem || !meterNumber.trim()) {
      toast({ title: "Error", description: "Select a meter type and enter meter number", variant: "destructive" });
      return;
    }
    setValidatingMeter(true);
    try {
      const res = await apiFetch("/bills/electricity/validate", {
        method: "POST",
        body: JSON.stringify({
          meterNumber: meterNumber.trim(),
          itemCode: selectedElectricityItem.item_code,
          billerCode: selectedElectricityItem.biller_code,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Validation failed");
      }
      setMeterValidated(true);
      setMeterCustomerName(json.data?.customerName ?? "Valid");
      toast({ title: "Meter verified", description: json.data?.customerName ?? "You can proceed." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Meter validation failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
      setMeterValidated(false);
    } finally {
      setValidatingMeter(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      let endpoint: string;
      let body: Record<string, unknown>;
      if (tab === "airtime") {
        endpoint = "/bills/airtime";
        body = { network: selectedNetwork, amount: parseFloat(airtimeAmount), phoneNumber };
      } else if (tab === "data") {
        endpoint = "/bills/data";
        body = { network: selectedNetwork, planCode: selectedPlan!.plan_code, phoneNumber };
      } else {
        endpoint = "/bills/electricity";
        const meterType = selectedElectricityItem!.name.toLowerCase().includes("prepaid") ? "prepaid" : "postpaid";
        body = {
          meterNumber: meterNumber.trim(),
          amount: parseFloat(electricityAmount),
          disco: selectedDisco,
          type: meterType,
          itemName: selectedElectricityItem!.name,
          itemCode: selectedElectricityItem!.item_code,
        };
      }

      const res = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.message || "Purchase failed");
      }

      setPurchaseResult(json.data ?? json);
      setStep("success");
      fetchBalance();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────

  const networksToShow =
    tab === "airtime" ? airtimeNetworks : tab === "data" ? dataNetworks : discos;
  const networksLoading =
    tab === "airtime" ? airtimeNetworksLoading : tab === "data" ? dataNetworksLoading : discosLoading;

  const selectedNetworkName = useMemo(() => {
    const nets = tab === "airtime" ? airtimeNetworks : tab === "data" ? dataNetworks : discos;
    const found = nets.find((n) => (n.id ?? n.identifier) === (tab === "electricity" ? selectedDisco : selectedNetwork));
    return found?.name || (tab === "electricity" ? selectedDisco : selectedNetwork);
  }, [tab, selectedNetwork, selectedDisco, airtimeNetworks, dataNetworks, discos]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-4 px-4 py-4 max-w-2xl mx-auto">
          <button
            onClick={() => (step === "form" ? navigate("/") : resetForm())}
            className="p-2 hover:bg-muted rounded-full transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold">
              {tab === "airtime" ? "Buy Airtime" : tab === "data" ? "Buy Data" : "Buy Electricity"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {tab === "electricity"
                ? "Prepaid & postpaid meter payments"
                : "Instant top-up to any Nigerian number"}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-6 pb-24">
        {/* Tab switcher */}
        <div className="flex rounded-xl bg-muted p-1">
          <button
            onClick={() => switchTab("airtime")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === "airtime"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Smartphone className="h-4 w-4 shrink-0" />
            Airtime
          </button>
          <button
            onClick={() => switchTab("data")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === "data"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Wifi className="h-4 w-4 shrink-0" />
            Data
          </button>
          <button
            onClick={() => switchTab("electricity")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === "electricity"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Zap className="h-4 w-4 shrink-0" />
            Electricity
          </button>
        </div>

        {/* Balance card */}
        {balance !== null && (
          <div className="rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 p-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Available Balance</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              ₦{parseFloat(balance).toLocaleString()}
            </p>
          </div>
        )}

        {/* ── Form Step ──────────────────────────────────────────── */}
        {step === "form" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Network / Disco selection */}
            <div>
              <label className="text-sm font-medium mb-3 block">
                {tab === "electricity" ? "Select Disco" : "Select Network"}
              </label>
              {networksLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {networksToShow.map((net) => {
                    const netId = net.id ?? net.identifier ?? net.network_id;
                    const netName = net.name || netId;
                    const isSelected =
                      tab === "electricity" ? selectedDisco === netId : selectedNetwork === netId;
                    return (
                      <button
                        key={netId}
                        onClick={() =>
                          tab === "electricity" ? setSelectedDisco(netId) : setSelectedNetwork(netId)
                        }
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                          isSelected
                            ? getNetworkStyle(netName)
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex-1 text-left">
                          <p className="font-semibold text-sm">{netName}</p>
                        </div>
                        {isSelected && (
                          <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Electricity: meter type (item) */}
            {tab === "electricity" && selectedDisco && (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Meter type
                </label>
                {electricityItemsLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : electricityItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No plans for this disco</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {electricityItems.map((item) => {
                      const isSelected = selectedElectricityItem?.item_code === item.item_code;
                      return (
                        <button
                          key={item.item_code}
                          onClick={() => {
                            setSelectedElectricityItem(item);
                            setMeterValidated(false);
                          }}
                          className={`w-full flex items-center justify-between p-3 rounded-xl border-2 text-left transition-all ${
                            isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                          }`}
                        >
                          <span className="font-medium text-sm">{item.name}</span>
                          {isSelected && (
                            <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                              <Check className="h-3 w-3 text-primary-foreground" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Meter number (electricity) */}
            {tab === "electricity" && selectedElectricityItem && (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Meter number
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={meterNumber}
                    onChange={(e) => {
                      setMeterNumber(e.target.value.replace(/\D/g, ""));
                      setMeterValidated(false);
                    }}
                    placeholder="e.g. 45145984782"
                    className="flex-1 bg-background rounded-xl border border-border px-4 py-3 text-base font-mono outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <Button
                    type="button"
                    variant={meterValidated ? "secondary" : "outline"}
                    onClick={handleValidateMeter}
                    disabled={validatingMeter || meterNumber.length < 6}
                    className="shrink-0 rounded-xl"
                  >
                    {validatingMeter ? <Loader2 className="h-4 w-4 animate-spin" /> : meterValidated ? "Verified" : "Verify"}
                  </Button>
                </div>
                {meterValidated && meterCustomerName && (
                  <p className="text-xs text-green-600 mt-1">✓ {meterCustomerName}</p>
                )}
              </div>
            )}

            {/* Phone number (airtime & data) */}
            {(tab === "airtime" || tab === "data") && (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  placeholder="08012345678"
                  className="w-full bg-background rounded-xl border border-border px-4 py-3 text-base font-mono outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            )}

            {/* Airtime: amount */}
            {tab === "airtime" && (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Amount (₦)
                </label>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {QUICK_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setAirtimeAmount(String(amt))}
                      className={`py-2.5 rounded-lg text-sm font-medium border transition-all ${
                        airtimeAmount === String(amt)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      ₦{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={airtimeAmount}
                  onChange={(e) => setAirtimeAmount(e.target.value)}
                  placeholder="Or enter custom amount"
                  min="50"
                  max="50000"
                  className="w-full bg-background rounded-xl border border-border px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Min: ₦50 &bull; Max: ₦50,000
                </p>
              </div>
            )}

            {/* Electricity: amount */}
            {tab === "electricity" && meterValidated && (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Amount (₦)
                </label>
                <input
                  type="number"
                  value={electricityAmount}
                  onChange={(e) => setElectricityAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  min="500"
                  max="500000"
                  className="w-full bg-background rounded-xl border border-border px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Min: ₦500 &bull; Max: ₦500,000 &bull; ₦100 fee applies
                </p>
              </div>
            )}

            {/* Data: plan selection */}
            {tab === "data" && selectedNetwork && (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Select Data Plan
                </label>
                {dataPlansLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : dataPlans.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No plans available for this network
                  </p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {dataPlans.map((plan) => {
                      const code = plan.plan_code;
                      const isSelected = selectedPlan?.plan_code === code;
                      return (
                        <button
                          key={code}
                          onClick={() => setSelectedPlan(plan)}
                          className={`w-full flex items-center justify-between p-3.5 rounded-xl border-2 transition-all text-left ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <div>
                            <p className="font-medium text-sm">{plan.name}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm">
                              ₦{(plan.price ?? 0).toLocaleString()}
                            </span>
                            {isSelected && (
                              <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                                <Check className="h-3 w-3 text-primary-foreground" />
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Continue button */}
            <Button
              onClick={() => setStep("confirm")}
              disabled={
                tab === "airtime"
                  ? !canConfirmAirtime
                  : tab === "data"
                    ? !canConfirmData
                    : !canConfirmElectricity
              }
              className="w-full h-14 rounded-xl gradient-brand text-primary-foreground font-semibold text-lg"
            >
              Continue
            </Button>
          </motion.div>
        )}

        {/* ── Confirm Step ─────────────────────────────────────────── */}
        {step === "confirm" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-5"
          >
            <div className="rounded-xl border-2 border-primary bg-primary/5 p-6 space-y-4">
              <h2 className="text-lg font-bold text-center">Confirm Purchase</h2>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium capitalize">{tab}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {tab === "electricity" ? "Disco" : "Network"}
                  </span>
                  <span className="font-medium">{selectedNetworkName}</span>
                </div>
                {tab === "electricity" ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Meter</span>
                      <span className="font-medium font-mono">{meterNumber}</span>
                    </div>
                    {selectedElectricityItem && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Meter type</span>
                        <span className="font-medium">{selectedElectricityItem.name}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Phone</span>
                    <span className="font-medium font-mono">{phoneNumber}</span>
                  </div>
                )}
                {tab === "data" && selectedPlan && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="font-medium">{selectedPlan.name}</span>
                  </div>
                )}
                <div className="border-t border-border my-2" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="text-xl font-bold">
                    ₦{(tab === "electricity" ? electricityTotal : currentAmount).toLocaleString()}
                  </span>
                </div>
                {tab === "electricity" && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Amount + ₦100 fee</span>
                  </div>
                )}
                {balance !== null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Balance after</span>
                    <span className="font-medium">
                      ₦{(
                        parseFloat(balance) -
                        (tab === "electricity" ? electricityTotal : currentAmount)
                      ).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setStep("form")}
                variant="outline"
                className="flex-1 h-12 rounded-xl"
                disabled={loading}
              >
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 h-12 rounded-xl gradient-brand text-primary-foreground font-semibold"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : tab === "airtime" ? (
                  "Buy Airtime"
                ) : tab === "data" ? (
                  "Buy Data"
                ) : (
                  "Pay Electricity"
                )}
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── Success Step ─────────────────────────────────────────── */}
        <AnimatePresence>
          {step === "success" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl border-2 border-green-500/30 bg-green-500/5 p-6 text-center space-y-4"
            >
              <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <Check className="h-8 w-8 text-green-500" />
              </div>
              <h2 className="text-xl font-bold">
                {tab === "airtime"
                  ? "Airtime Sent!"
                  : tab === "data"
                    ? "Data Activated!"
                    : "Electricity Paid!"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {tab === "airtime" ? (
                  <>
                    <span className="font-semibold text-foreground">
                      ₦{currentAmount.toLocaleString()}
                    </span>{" "}
                    airtime sent to{" "}
                    <span className="font-semibold text-foreground font-mono">
                      {phoneNumber}
                    </span>
                  </>
                ) : tab === "data" ? (
                  <>
                    <span className="font-semibold text-foreground">
                      {selectedPlan?.name}
                    </span>{" "}
                    data plan activated for{" "}
                    <span className="font-semibold text-foreground font-mono">
                      {phoneNumber}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-foreground">
                      ₦{currentAmount.toLocaleString()}
                    </span>{" "}
                    electricity paid for meter{" "}
                    <span className="font-semibold text-foreground font-mono">
                      {meterNumber}
                    </span>
                  </>
                )}
              </p>
              {tab === "electricity" && purchaseResult?.token && (
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Prepaid token</p>
                  <p className="font-mono font-bold text-base break-all">{purchaseResult.token}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Enter this on your meter</p>
                </div>
              )}
              {purchaseResult?.balanceAfter && (
                <p className="text-xs text-muted-foreground">
                  New balance: ₦{parseFloat(purchaseResult.balanceAfter).toLocaleString()}
                </p>
              )}
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => navigate("/")}
                  className="flex-1 rounded-xl gradient-brand text-primary-foreground font-semibold"
                >
                  <Wallet className="h-4 w-4 mr-2" />
                  Go to Wallet
                </Button>
                <Button onClick={resetForm} variant="outline" className="flex-1 rounded-xl">
                  Buy Again
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Error Step ───────────────────────────────────────────── */}
        <AnimatePresence>
          {step === "error" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl border-2 border-red-500/30 bg-red-500/5 p-6 text-center space-y-4"
            >
              <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                <Smartphone className="h-8 w-8 text-red-500" />
              </div>
              <h2 className="text-xl font-bold">Purchase Failed</h2>
              <p className="text-sm text-muted-foreground">
                Something went wrong. Your balance has been refunded if it was debited.
              </p>
              <div className="flex gap-3 pt-2">
                <Button onClick={resetForm} variant="outline" className="flex-1 rounded-xl">
                  Try Again
                </Button>
                <Button
                  onClick={() => navigate("/")}
                  className="flex-1 rounded-xl"
                >
                  Go Home
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Bills;
